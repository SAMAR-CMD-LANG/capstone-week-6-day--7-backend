import request from 'supertest';
import app from '../test-server.js';
import { supabase } from '../db.js';

describe('Integration Tests - Full User Journey', () => {
    let testUser = {
        name: 'Integration Test User',
        email: `integration-test-${Date.now()}@example.com`,
        password: 'integrationtest123'
    };

    let authToken = '';
    let userId = null;
    let postIds = [];

    // Cleanup function
    const cleanupTestData = async () => {
        try {
            // Clean up posts
            if (postIds.length > 0) {
                await supabase.from('Posts').delete().in('id', postIds);
            }
            // Clean up user
            if (userId) {
                await supabase.from('Posts').delete().eq('user_id', userId);
                await supabase.from('Users').delete().eq('id', userId);
            }
        } catch (error) {
            console.log('Cleanup error:', error.message);
        }
    };

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('Complete User Journey', () => {
        test('1. User Registration', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send(testUser)
                .expect(201);

            expect(response.body.message).toBe('User created successfully');
            expect(response.body.user).toHaveProperty('id');
            expect(response.body.user.email).toBe(testUser.email);

            userId = response.body.user.id;
        });

        test('2. User Login', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                })
                .expect(200);

            expect(response.body.message).toBe('Login successful');
            expect(response.headers['set-cookie']).toBeDefined();

            // Extract auth token
            const cookies = response.headers['set-cookie'];
            const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
            authToken = tokenCookie.split('=')[1].split(';')[0];
        });

        test('3. Get User Profile', async () => {
            const response = await request(app)
                .get('/auth/me')
                .set('Cookie', [`token=${authToken}`])
                .expect(200);

            expect(response.body.user).toHaveProperty('id', userId);
            expect(response.body.user).toHaveProperty('name', testUser.name);
            expect(response.body.user).toHaveProperty('email', testUser.email);
        });

        test('4. Create Multiple Posts', async () => {
            const posts = [
                { title: 'First Integration Test Post', body: 'This is the first test post content.' },
                { title: 'Second Integration Test Post', body: 'This is the second test post content.' },
                { title: 'Third Integration Test Post', body: 'This is the third test post content.' }
            ];

            for (const post of posts) {
                const response = await request(app)
                    .post('/posts')
                    .set('Cookie', [`token=${authToken}`])
                    .send(post)
                    .expect(201);

                expect(response.body.message).toBe('post created successfully');
                expect(response.body.post.title).toBe(post.title);
                expect(response.body.post.body).toBe(post.body);
                expect(response.body.post.user_id).toBe(userId);

                postIds.push(response.body.post.id);
            }
        });

        test('5. Get All Posts (Including Created Posts)', async () => {
            const response = await request(app)
                .get('/posts')
                .expect(200);

            expect(response.body.posts).toBeDefined();
            expect(Array.isArray(response.body.posts)).toBe(true);

            // Check if our created posts are in the response
            const ourPosts = response.body.posts.filter(post => postIds.includes(post.id));
            expect(ourPosts.length).toBeGreaterThan(0);
        });

        test('6. Search for Created Posts', async () => {
            const response = await request(app)
                .get('/posts?search=Integration Test')
                .expect(200);

            expect(response.body.posts).toBeDefined();
            const foundPosts = response.body.posts.filter(post =>
                post.title.includes('Integration Test')
            );
            expect(foundPosts.length).toBeGreaterThan(0);
        });

        test('7. Update a Post', async () => {
            const updatedData = {
                title: 'Updated Integration Test Post',
                body: 'This post has been updated during integration testing.'
            };

            const response = await request(app)
                .put(`/posts/${postIds[0]}`)
                .set('Cookie', [`token=${authToken}`])
                .send(updatedData)
                .expect(200);

            expect(response.body.updatedPost.title).toBe(updatedData.title);
            expect(response.body.updatedPost.body).toBe(updatedData.body);
        });

        test('8. Delete a Post', async () => {
            const response = await request(app)
                .delete(`/posts/${postIds[1]}`)
                .set('Cookie', [`token=${authToken}`])
                .expect(200);

            expect(response.body.message).toBe('post deleted successfully');

            // Verify post is deleted
            const getResponse = await request(app)
                .get('/posts')
                .expect(200);

            const deletedPost = getResponse.body.posts.find(post => post.id === postIds[1]);
            expect(deletedPost).toBeUndefined();
        });

        test('9. User Logout', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .set('Cookie', [`token=${authToken}`])
                .expect(200);

            expect(response.body.message).toBe('logout successful');
        });

        test('10. Verify Logout (Access Protected Route)', async () => {
            const response = await request(app)
                .get('/auth/me')
                .set('Cookie', [`token=${authToken}`])
                .expect(401);

            expect(response.body.user).toBe(null);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle concurrent requests', async () => {
            // Login again for this test
            const loginResponse = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            const cookies = loginResponse.headers['set-cookie'];
            const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
            const newAuthToken = tokenCookie.split('=')[1].split(';')[0];

            // Make multiple concurrent requests
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    request(app)
                        .post('/posts')
                        .set('Cookie', [`token=${newAuthToken}`])
                        .send({
                            title: `Concurrent Post ${i}`,
                            body: `This is concurrent post number ${i}`
                        })
                );
            }

            const responses = await Promise.all(promises);

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(201);
                expect(response.body.message).toBe('post created successfully');
            });

            // Clean up concurrent posts
            const concurrentPostIds = responses.map(res => res.body.post.id);
            await supabase.from('Posts').delete().in('id', concurrentPostIds);
        });

        test('should handle malformed JSON', async () => {
            const response = await request(app)
                .post('/auth/register')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);
        });

        test('should handle very long input strings', async () => {
            const longString = 'a'.repeat(10000);

            const loginResponse = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            const cookies = loginResponse.headers['set-cookie'];
            const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
            const newAuthToken = tokenCookie.split('=')[1].split(';')[0];

            const response = await request(app)
                .post('/posts')
                .set('Cookie', [`token=${newAuthToken}`])
                .send({
                    title: longString,
                    body: longString
                });

            // Should either succeed or fail gracefully
            expect([200, 201, 400, 413]).toContain(response.status);
        });
    });
});