import request from 'supertest';
import app from '../test-server.js';
import { supabase } from '../db.js';
import jwt from 'jsonwebtoken';

describe('Authentication API Tests (Simplified)', () => {
    let testUser = {
        name: 'Test User Simple',
        email: `test-simple-${Date.now()}@example.com`,
        password: 'testpassword123'
    };

    let authToken = '';
    let userId = null;

    // Cleanup function
    const cleanupTestUser = async (email) => {
        try {
            await supabase.from('Users').delete().eq('email', email);
        } catch (error) {
            console.log('Cleanup error:', error.message);
        }
    };

    beforeAll(async () => {
        await cleanupTestUser(testUser.email);
    });

    afterAll(async () => {
        await cleanupTestUser(testUser.email);
    });

    describe('POST /auth/register', () => {
        test('should register a new user successfully', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send(testUser)
                .expect(201);

            expect(response.body).toHaveProperty('message', 'User created successfully');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('id');
            expect(response.body.user).toHaveProperty('name', testUser.name);
            expect(response.body.user).toHaveProperty('email', testUser.email);

            userId = response.body.user.id;
        });

        test('should not register user with missing fields', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com'
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'all fields are required');
        });

        test('should not register user with existing email', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send(testUser)
                .expect(400);

            expect(response.body).toHaveProperty('message', 'user already exists');
        });
    });

    describe('POST /auth/login', () => {
        test('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Login successful');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('id', userId);
            expect(response.body.user).toHaveProperty('email', testUser.email);

            // Generate token manually for testing
            authToken = jwt.sign(
                { id: userId, email: testUser.email },
                process.env.JWT_SECRET,
                { expiresIn: "24h" }
            );
        });

        test('should not login with invalid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword'
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });

        test('should not login with missing credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'Both email and password are required');
        });
    });

    describe('Protected Routes with Authorization Header', () => {
        test('should access protected route with valid token', async () => {
            const response = await request(app)
                .post('/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    title: 'Test Post',
                    body: 'This is a test post'
                })
                .expect(201);

            expect(response.body).toHaveProperty('message', 'post created successfully');
            expect(response.body.post).toHaveProperty('title', 'Test Post');
        });

        test('should not access protected route without token', async () => {
            const response = await request(app)
                .post('/posts')
                .send({
                    title: 'Test Post',
                    body: 'This is a test post'
                })
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid or no token found');
        });

        test('should not access protected route with invalid token', async () => {
            const response = await request(app)
                .post('/posts')
                .set('Authorization', 'Bearer invalid_token')
                .send({
                    title: 'Test Post',
                    body: 'This is a test post'
                })
                .expect(401);

            expect(response.body).toHaveProperty('message', 'Invalid token');
        });
    });

    describe('GET /posts (Public Route)', () => {
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

        test('should handle pagination parameters', async () => {
            const response = await request(app)
                .get('/posts?page=1&limit=5')
                .expect(200);

            expect(response.body).toHaveProperty('currentPage', 1);
            expect(response.body.posts.length).toBeLessThanOrEqual(5);
        });

        test('should handle search parameters', async () => {
            const response = await request(app)
                .get('/posts?search=test')
                .expect(200);

            expect(response.body).toHaveProperty('posts');
            expect(Array.isArray(response.body.posts)).toBe(true);
        });
    });

    describe('POST /auth/logout', () => {
        test('should logout successfully', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'logout successful');
        });
    });
});