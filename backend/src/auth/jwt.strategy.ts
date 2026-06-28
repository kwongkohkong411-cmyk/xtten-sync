import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

type JwtRequest = { headers?: Record<string, unknown> };

type JwtStrategyOptions = {
  jwtFromRequest: (request: JwtRequest | undefined) => string | null;
  secretOrKey: string;
};

type JwtStrategyBaseCtor = abstract new (
  options: JwtStrategyOptions,
) => Strategy;

const JwtStrategyBase: JwtStrategyBaseCtor = PassportStrategy(Strategy);

type JwtPayload = {
  sub: string;
  role?: string;
  email?: string;
  companyId?: string | null;
};

@Injectable()
export class JwtStrategy extends JwtStrategyBase {
  constructor() {
    // PassportStrategy mixin typing resolves to an unsafe callable in eslint's analysis.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: (request: JwtRequest | undefined) => {
        const authHeader = request?.headers?.authorization;
        if (typeof authHeader !== 'string') return null;
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        return match?.[1] || null;
      },
      secretOrKey: process.env.JWT_SECRET || 'secret',
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      companyId: payload.companyId,
    };
  }
}
