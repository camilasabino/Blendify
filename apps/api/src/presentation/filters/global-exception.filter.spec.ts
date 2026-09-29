import { Logger, type ArgumentsHost } from '@nestjs/common';
import { runWithRequestId } from '@/application/services/request-correlation';
import { GlobalExceptionFilter } from './global-exception.filter';

const REQUEST_ID = '3f1c2a9e-7b4d-4e8a-9c1f-2d6b5e8a7c30';
const CONTENT_SENTINEL = 'PROVIDER_TRACK_SENTINEL';

function host(): ArgumentsHost {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs unhandled errors with frames and correlation but without the message', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    runWithRequestId(REQUEST_ID, () =>
      new GlobalExceptionFilter().catch(
        new TypeError(`data: { name: "${CONTENT_SENTINEL}" }`),
        host(),
      ),
    );

    const [message, stack] = error.mock.calls[0] as [string, string];
    expect(JSON.parse(message)).toEqual({
      event: 'unhandled_error',
      requestId: REQUEST_ID,
      errorName: 'TypeError',
    });
    expect(stack).toContain('at ');
    expect(`${message}\n${stack}`).not.toContain(CONTENT_SENTINEL);
  });
});
