import request from 'supertest';
import app from '../test-server.js';
import { supabase } from '../db.js';

describe('Authentication API Tests', () => {
    let testUser = {
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'testpassword123'
    };

    let authToken = '';
    let userId = null;

    // Cleanup function to remove test users
    const cleanupTestUser = async (email) => {
        try {
            await supabase.from('Users').delete().eq('email', email);
        } catch (error) {
            console.log('Cleanup error (expected if user doesn\'t exist):', error.message);
        }
    };

    beforeAll(async () => {
        // Clean up any existing test user
        await cleanupTestUser(testUser.email);
    });

    afterAll(async () => {
        // Clean up test user after all tests
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
            expect(response.body.user).not.toHaveProperty('password');

            userId = response.body.user.id;
        });

        test('should not register user with missing fields', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com'
                    // missing password
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

        test('should not register user with invalid email format', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    name: 'Test User',
                    email: 'invalid-email',
                    password: 'password123'
                })
                .expect(400);

            expect(response.body).toHaveProperty('message');
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
            expect(response.headers['set-cookie']).toBeDefined();

            // Extract token from cookie for future tests
            const cookies = response.headers['set-cookie'];
            const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
            if (tokenCookie) {
                authToken = tokenCookie.split('=')[1].split(';')[0];
            }
        });

        test('should not login with missing credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email
                    // missing password
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'Both email and password are required');
        });

        test('should not login with invalid email', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: testUser.password
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'User not found');
        });

        test('should not login with invalid password', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword'
                })
                .expect(400);

            expect(response.body).toHaveProperty('message', 'Invalid credentials');
        });
    });

    describe('GET /auth/me', () => {
        test('should get current user with valid token', async () => {
            const response = await request(app)
                .get('/auth/me')
                .set('Cookie', [`token=${authToken}`])
                .expect(200);

            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('id', userId);
            expect(response.body.user).toHaveProperty('name', testUser.name);
            expect(response.body.user).toHaveProperty('email', testUser.email);
            expect(response.body.user).toHaveProperty('created_at');
        });

        test('should not get user without token', async () => {
            const response = await request(app)
                .get('/auth/me')
                .expect(401);

            expect(response.body).toHaveProperty('user', null);
        });

        test('should not get user with invalid token', async () => {
            const response = await request(app)
                .get('/auth/me')
                .set('Cookie', ['token=invalid_token'])
                .expect(401);

            expect(response.body).toHaveProperty('user', null);
        });
    });

    describe('POST /auth/logout', () => {
        test('should logout successfully', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .set('Cookie', [`token=${authToken}`])
                .expect(200);

            expect(response.body).toHaveProperty('message', 'logout successful');
            expect(response.headers['set-cookie']).toBeDefined();

            // Check that cookie is cleared
            const cookies = response.headers['set-cookie'];
            const clearedCookie = cookies.find(cookie => cookie.includes('token=;'));
            expect(clearedCookie).toBeDefined();
        });

        test('should logout even without token', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'logout successful');
        });
    });
});