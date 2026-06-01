// tests/apiUser.test.js

import { userController } from '../controllers/userController.js';
import { userRepository } from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { describe, it, expect, vi } from 'vitest';

dotenv.config();

const secretKey = process.env.JWT_SECRET;

describe('userController', () => {
  it('should register a new user', async () => {
    const request = { body: { surnom: 'user1', email: 'user1@example.com', motDePasse: 'password123', cheminImage: 'path/to/image.jpg' } };
    const reply = { send: vi.fn() };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    const mockUser = { UtilisateurID: 1, surnom: 'user1', email: 'user1@example.com', motDePasse: hashedPassword, cheminImage: 'path/to/image.jpg', salt };

    vi.spyOn(userRepository, 'createUser').mockResolvedValue(mockUser);

    await userController.register(request, reply);

    expect(reply.send).toHaveBeenCalledWith(mockUser);
  });

  it('should login a user', async () => {
    const request = { body: { surnom: 'user1', motDePasse: 'password123' } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    const mockUser = { UtilisateurID: 1, surnom: 'user1', motDePasse: hashedPassword, salt };

    vi.spyOn(userRepository, 'getUserBySurnom').mockResolvedValue(mockUser);

    await userController.login(request, reply);

    expect(reply.send).toHaveBeenCalled();
  });

  it('should update user password', async () => {
    const request = { body: { surnom: 'user1', oldPassword: 'password123', newPassword: 'newpassword123' } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    const mockUser = { UtilisateurID: 1, surnom: 'user1', motDePasse: hashedPassword, salt };

    vi.spyOn(userRepository, 'getUserBySurnom').mockResolvedValue(mockUser);
    vi.spyOn(userRepository, 'updateUserPassword').mockResolvedValue(mockUser);

    await userController.updatePassword(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'Password updated successfully' });
  });

  it('should delete user', async () => {
    const request = { body: { surnom: 'user1' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    const mockUser = { UtilisateurID: 1, surnom: 'user1' };

    vi.spyOn(userRepository, 'getUserBySurnom').mockResolvedValue(mockUser);
    vi.spyOn(userRepository, 'deleteUserBySurnom').mockResolvedValue(mockUser);

    await userController.deleteUser(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'User deleted successfully' });
  });

  it('should not delete user if unauthorized', async () => {
    const request = { body: { surnom: 'user1' }, headers: { authorization: `Bearer invalid_token` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.deleteUser(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('should not delete user if forbidden', async () => {
    const request = { body: { surnom: 'user2' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.deleteUser(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('should update user surnom', async () => {
    const request = { body: { newSurnom: 'newUser1' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    vi.spyOn(userRepository, 'updateUserSurnom').mockResolvedValue({});

    await userController.updateSurnom(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'Surnom updated successfully' });
  });

  it('should update user email', async () => {
    const request = { body: { newEmail: 'newuser1@example.com' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    vi.spyOn(userRepository, 'updateUserEmail').mockResolvedValue({});

    await userController.updateEmail(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'Email updated successfully' });
  });

  it('should update user profile image', async () => {
    const request = { body: { cheminImage: 'path/to/new/image.jpg' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    vi.spyOn(userRepository, 'updateUserProfileImage').mockResolvedValue({});

    await userController.updateProfileImage(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'Profile image updated successfully' });
  });

  it('should delete user profile image', async () => {
    const request = { headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    vi.spyOn(userRepository, 'deleteUserProfileImage').mockResolvedValue({});

    await userController.deleteProfileImage(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ message: 'Profile image deleted successfully' });
  });
});