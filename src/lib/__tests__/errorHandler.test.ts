import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, handleError, logError } from '../errorHandler';

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('AppError', () => {
    it('should create an AppError instance', () => {
      const error = new AppError('Test error', 'TEST_CODE', { detail: 'test' });
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
    });
  });

  describe('handleError', () => {
    it('should handle AppError', () => {
      const error = new AppError('Test error');
      const result = handleError(error);
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Test error');
    });

    it('should handle Error', () => {
      const error = new Error('Test error');
      const result = handleError(error);
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Test error');
    });

    it('should handle string error', () => {
      const result = handleError('Test error');
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Test error');
    });

    it('should add context to error message', () => {
      const error = new Error('Test error');
      handleError(error, 'TestContext');
      expect(console.error).toHaveBeenCalledWith('[TestContext] Test error', error);
    });
  });

  describe('logError', () => {
    it('should log error without throwing', () => {
      const error = new Error('Test error');
      expect(() => logError(error)).not.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
