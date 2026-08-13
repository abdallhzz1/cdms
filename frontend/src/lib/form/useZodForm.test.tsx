import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { useZodForm } from './useZodForm';

// Not a business form — this only proves the React Hook Form + Zod
// foundation itself works (Prompt 01 §14/§29). Real business forms are
// built in later phases on top of this same hook.
const schema = z.object({
  email: z.string().email('Invalid email'),
});

function TestForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful },
  } = useZodForm(schema);

  return (
    <form onSubmit={handleSubmit(() => {})}>
      <input aria-label="email" {...register('email')} />
      {errors.email && <span role="alert">{errors.email.message}</span>}
      {isSubmitSuccessful && <span data-testid="success">submitted</span>}
      <button type="submit">Submit</button>
    </form>
  );
}

describe('useZodForm', () => {
  it('surfaces a Zod validation error for invalid input', async () => {
    render(<TestForm />);

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
    });
  });

  it('submits successfully once the Zod schema is satisfied', async () => {
    render(<TestForm />);

    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'user@hebron.edu' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByTestId('success')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
