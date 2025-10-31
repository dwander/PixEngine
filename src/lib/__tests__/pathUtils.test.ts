import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  normalizePaths,
  pathsEqual,
  getFileName,
  getDirectoryPath,
  getFileExtension,
  isImageFile,
} from '../pathUtils';

describe('pathUtils', () => {
  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('C:\\Users\\Test\\image.jpg')).toBe('C:/Users/Test/image.jpg');
    });

    it('should handle paths with forward slashes', () => {
      expect(normalizePath('C:/Users/Test/image.jpg')).toBe('C:/Users/Test/image.jpg');
    });

    it('should handle mixed slashes', () => {
      expect(normalizePath('C:\\Users/Test\\image.jpg')).toBe('C:/Users/Test/image.jpg');
    });
  });

  describe('normalizePaths', () => {
    it('should normalize an array of paths', () => {
      const paths = ['C:\\Users\\Test\\1.jpg', 'D:\\Photos\\2.jpg'];
      const expected = ['C:/Users/Test/1.jpg', 'D:/Photos/2.jpg'];
      expect(normalizePaths(paths)).toEqual(expected);
    });
  });

  describe('pathsEqual', () => {
    it('should return true for equal paths', () => {
      expect(pathsEqual('C:\\Users\\Test', 'C:/users/test')).toBe(true);
    });

    it('should return false for different paths', () => {
      expect(pathsEqual('C:\\Users\\Test', 'C:/Users/Other')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(pathsEqual('C:\\USERS\\TEST', 'c:/users/test')).toBe(true);
    });
  });

  describe('getFileName', () => {
    it('should extract filename from path', () => {
      expect(getFileName('C:/Users/Test/image.jpg')).toBe('image.jpg');
    });

    it('should handle backslashes', () => {
      expect(getFileName('C:\\Users\\Test\\image.jpg')).toBe('image.jpg');
    });

    it('should return empty string for directory path', () => {
      expect(getFileName('C:/Users/Test/')).toBe('');
    });
  });

  describe('getDirectoryPath', () => {
    it('should extract directory path', () => {
      expect(getDirectoryPath('C:/Users/Test/image.jpg')).toBe('C:/Users/Test');
    });

    it('should handle backslashes', () => {
      expect(getDirectoryPath('C:\\Users\\Test\\image.jpg')).toBe('C:/Users/Test');
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('image.jpg')).toBe('jpg');
    });

    it('should be case insensitive', () => {
      expect(getFileExtension('image.JPG')).toBe('jpg');
    });

    it('should return empty string for no extension', () => {
      expect(getFileExtension('image')).toBe('');
    });

    it('should handle paths with extension', () => {
      expect(getFileExtension('C:/Users/Test/image.png')).toBe('png');
    });
  });

  describe('isImageFile', () => {
    it('should return true for image extensions', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('photo.PNG')).toBe(true);
      expect(isImageFile('photo.gif')).toBe(true);
      expect(isImageFile('photo.webp')).toBe(true);
    });

    it('should return false for non-image extensions', () => {
      expect(isImageFile('document.pdf')).toBe(false);
      expect(isImageFile('video.mp4')).toBe(false);
      expect(isImageFile('file.txt')).toBe(false);
    });
  });
});
