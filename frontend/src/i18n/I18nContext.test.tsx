import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import { I18nProvider, useI18n } from './I18nContext';

function Probe() {
  const { t, locale, direction } = useI18n();
  return (
    <div>
      <p data-testid="app-name">{t('common.appName')}</p>
      <p data-testid="locale">{locale}</p>
      <p data-testid="direction">{direction}</p>
    </div>
  );
}

function Harness() {
  const { setLocale } = useI18n();
  return (
    <>
      <Probe />
      <button onClick={() => setLocale('ar')}>switch-to-ar</button>
      <button onClick={() => setLocale('en')}>switch-to-en</button>
    </>
  );
}

describe('I18nProvider', () => {
  it('defaults to English/LTR and resolves translation keys', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('direction')).toHaveTextContent('ltr');
    expect(screen.getByTestId('app-name')).toHaveTextContent('Clinical Department Management System');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switching language updates translated text and document direction to RTL', () => {
    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('switch-to-ar'));

    expect(screen.getByTestId('locale')).toHaveTextContent('ar');
    expect(screen.getByTestId('direction')).toHaveTextContent('rtl');
    expect(screen.getByTestId('app-name')).toHaveTextContent('نظام إدارة الدائرة السريرية');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('switching back to English restores LTR', () => {
    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('switch-to-ar'));
    fireEvent.click(screen.getByText('switch-to-en'));

    expect(screen.getByTestId('direction')).toHaveTextContent('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
