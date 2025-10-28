import request from 'supertest';
import app from '../test-server.js';
import { supabase } from '../db.js';
import jwt from 'jsonwebtoken';

describe('Posts API Tests (Simplified)', () => {
    let testUser = {
        name: 'Test User Posts Simple',
        email: `test-posts-simple-${Date.now()}@example.com`,
        password: 'testpassword123'
    };

    let authToken = '';
    let userId = null;
    let testPostId = null;

    // Cleanup function
    const cleanupTestData = async () => {
        try {
            if (testPostId) {
                await supabase.from('Posts').delete().eq('id', testPostId);
            }
            if (userId) {
                await supabase.from('Posts').delete().eq('user_id', userId);
                await supabase.from('Users').delete().eq('id', userId);
            }
        } catch (error) {
            console.log('Cleanup error:', error.message);
        }
    };

    beforeAll(async () => {
        // Create test user
        const registerResponse = await request(app)
            .post('/auth/register')
            .send(testUser);

        userId = registerResponse.body.user.id;

        // Generate auth token manually
        authToken = jwt.sign(
            { id: userId, email: testUser.email },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('GET /posts', () => {
        test('should get posts without authentication', async () => {
            const response = await request(app)
                .get('/posts')
                .expect(200);

            expect(response.body).toHaveProperty('posts');
            expect(response.body).toHaveProperty('totalPosts');
            expect(response.body).toHaveProperty('totalPages');
            expect(response.body).toHaveProperty('currentPage');
            expect(Array.isArray(response.body.posts)).toBe(true);
        });

        test('should handle pagination correctly', async () => {
            const response = await request(app)
                .get('/posts?page=1&limit=3')
                .expect(200);

            expect(response.body.currentPage).toBe(1);
            expect(response.body.posts.length).toBeLessThanOrEqual(3);
        });

        test('should handle search functionality', async () => {
            const response = await request(app)
                .get('/posts?search=nonexistent')
                .expect(200);

            expect(response.body).toHaveProperty('posts');
            expect(Array.isArray(response.body.posts)).toBe(true);
        });

        test('should handle invalid page numbers gracefully', async () => {
            const response = await request(app)
                .get('/posts?page=0')
                .expect(200);

            expect(response.body.currentPage).toBe(1);
        });

        test('should limit maximum posts per page', async () => {
            const response = await request(app)
                .get('/posts?limit=1000')
                .expect(200);

            expect(response.body.posts.length).toBeLessThanOrEqual(100);
        });
    });

    describe('POST /posts', () => {
        test('should create post with valid authentication', async () => {
            const postData = {
                title: 'Test Post Title Simple',
                body: 'This is a test post body content for simple testing.'
            };

            const response = await request(app)
                .post('/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send(postData)
                .expect(201);

            expect(response.body).toHaveProperty('message', 'post created successfully');
            expect(response.body).toHaveProperty('post');
            expect(response.body.post).toHaveProperty('id');
            expect(response.body.post).toHaveProperty('title', postData.title);
            expect(response.body.post).toHaveProperty('body', postData.body);
            expect(response.body.post).toHaveProperty('user_id', userId);

            testPostId = response.body.post.id;
        });

        test('should not create post without authentication', async () => {
            const postData = {
                title: 'Unauthorized Post',
                body: 'This should not be created.'
            };

            const response = await request(app)
                .post('/posts')
                .send(postData)
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid or no token found');
        });

        test('should not create post with missing title', async () => {
            const postData = {
                body: 'Post without title'
            };

            const response = await request(app)
                .post('/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send(postData)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'title and body are required');
        });

        test('should not create post with missing body', async () => {
            const postData = {
                title: 'Post without body'
            };

            const response = await request(app)
                .post('/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send(postData)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'title and body are required');
        });

        test('should not create post with invalid token', async () => {
            const postData = {
                title: 'Test Post',
                body: 'Test body'
            };

            const response = await request(app)
                .post('/posts')
                .set('Authorization', 'Bearer invalid_token_here')
                .send(postData)
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid token');
        });
    });

    describe('PUT /posts/:id', () => {
        test('should update own post with valid authentication', async () => {
            const updateData = {
                title: 'Updated Test Post Title Simple',
                body: 'This is an updated test post body content.'
            };

            const response = await request(app)
                .put(`/posts/${testPostId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('updatedPost');
            expect(response.body.updatedPost).toHaveProperty('title', updateData.title);
            expect(response.body.updatedPost).toHaveProperty('body', updateData.body);
        });

        test('should not update post without authentication', async () => {
            const updateData = {
                title: 'Unauthorized Update',
                body: 'This should not work'
            };

            const response = await request(app)
                .put(`/posts/${testPostId}`)
                .send(updateData)
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid or no token found');
        });

        test('should not update post with missing fields', async () => {
            const updateData = {
                title: 'Only title provided'
            };

            const response = await request(app)
                .put(`/posts/${testPostId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'title and body are required');
        });

        test('should not update non-existent post', async () => {
            const updateData = {
                title: 'Non-existent post update',
                body: 'This post does not exist'
            };

            const response = await request(app)
                .put('/posts/999999')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'Not authorized to update this post or post not found');
        });
    });

    describe('DELETE /posts/:id', () => {
        test('should not delete post without authentication', async () => {
            const response = await request(app)
                .delete(`/posts/${testPostId}`)
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid or no token found');
        });

        test('should not delete non-existent post', async () => {
            const response = await request(app)
                .delete('/posts/999999')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'not authorized to delete this post or post not found');
        });

        test('should delete own post with valid authentication', async () => {
            const response = await request(app)
                .delete(`/posts/${testPostId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'post deleted successfully');
            expect(response.body).toHaveProperty('post');

            // Verify post is actually deleted
            const getResponse = await request(app)
                .get('/posts')
                .expect(200);

            const deletedPost = getResponse.body.posts.find(post => post.id === testPostId);
            expect(deletedPost).toBeUndefined();
        });
    });
});