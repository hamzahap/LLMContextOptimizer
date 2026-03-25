import { hash, compare } from 'bcrypt';
import { sign, verify } from 'jsonwebtoken';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
}

export interface AuthToken {
  userId: string;
  role: string;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export async function login(email: string, password: string): Promise<string> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error('User not found');
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid password');
  }

  return sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

export async function register(email: string, password: string): Promise<User> {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error('User already exists');
  }

  const passwordHash = await hash(password, 10);
  return createUser({ email, passwordHash, role: 'user' });
}

export function validateToken(token: string): AuthToken {
  return verify(token, JWT_SECRET) as AuthToken;
}

// Database stubs
async function findUserByEmail(_email: string): Promise<User | null> {
  return null;
}

async function createUser(_data: Omit<User, 'id'>): Promise<User> {
  return { id: 'new-id', ..._data };
}
