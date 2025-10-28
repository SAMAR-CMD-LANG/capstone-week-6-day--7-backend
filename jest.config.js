export default {
    testEnvironment: 'node',
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    collectCoverageFrom: [
        'index.js',
        'passport-config.js',
        'db.js',
        '!node_modules/**',
    ],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testTimeout: 30000,
};