// tests/apiUserFail.test.js

import { userController } from '../controllers/userController.js';
import { userRepository } from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { describe, it, expect, vi } from 'vitest';

dotenv.config();

const secretKey = process.env.JWT_SECRET;

describe('userController - Error Cases', () => {
  it('should return 400 error if required fields are missing during registration', async () => {
    const request = { body: { surnom: '', email: '', motDePasse: '' } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.register(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Surnom, Email, and Mot de Passe are required' });
  });

  it('should return 401 error if invalid credentials during login', async () => {
    const request = { body: { surnom: 'user1', motDePasse: 'wrongpassword' } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    vi.spyOn(userRepository, 'getUserBySurnom').mockResolvedValue(null);

    await userController.login(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });

  it('should return 401 error if old password is incorrect during password update', async () => {
    const request = { body: { surnom: 'user1', oldPassword: 'wrongpassword', newPassword: 'newpassword123' } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    const mockUser = { UtilisateurID: 1, surnom: 'user1', motDePasse: hashedPassword, salt };

    vi.spyOn(userRepository, 'getUserBySurnom').mockResolvedValue(mockUser);

    await userController.updatePassword(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Invalid old password' });
  });

  it('should return 401 error if unauthorized during user deletion', async () => {
    const request = { body: { surnom: 'user1' }, headers: { authorization: `Bearer invalid_token` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.deleteUser(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 403 error if forbidden during user deletion', async () => {
    const request = { body: { surnom: 'user2' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.deleteUser(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('should return 400 error if new surnom is missing during surnom update', async () => {
    const request = { body: { newSurnom: '' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.updateSurnom(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'New surnom is required' });
  });

  it('should return 400 error if new email is missing during email update', async () => {
    const request = { body: { newEmail: '' }, headers: { authorization: `Bearer ${jwt.sign({ userId: 1, surnom: 'user1' }, secretKey, { expiresIn: '1h' })}` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.updateEmail(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'New email is required' });
  });

  it('should return 401 error if unauthorized during profile image update', async () => {
    const request = { body: { cheminImage: 'path/to/new/image.jpg' }, headers: { authorization: `Bearer invalid_token` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.updateProfileImage(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 401 error if unauthorized during profile image deletion', async () => {
    const request = { headers: { authorization: `Bearer invalid_token` } };
    const reply = { send: vi.fn(), status: vi.fn().mockReturnThis() };

    await userController.deleteProfileImage(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});