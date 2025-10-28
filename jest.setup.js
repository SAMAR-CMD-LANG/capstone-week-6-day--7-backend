// Jest setup file for global test configuration
import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_12345';
process.env.COOKIE_NAME = 'test_token';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test_session_secret_12345';

// Global test timeout - increased for database operations
jest.setTimeout(60000);

// Suppress console logs during tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};