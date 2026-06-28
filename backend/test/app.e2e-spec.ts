import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

jest.setTimeout(30000);

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    const token = new JwtService({ secret: 'secret' }).sign({
      sub: 'test-user-id',
      role: 'SUPER_ADMIN',
      email: 'test@example.com',
      companyId: null,
    });

    return request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
