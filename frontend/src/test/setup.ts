import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
