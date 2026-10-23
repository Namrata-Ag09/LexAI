import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthPage from '../pages/Auth'

const login = vi.fn()
const register = vi.fn()
vi.mock('../auth', () => ({ useAuth: () => ({ login, register }) }))

beforeEach(() => { login.mockReset(); register.mockReset() })

test('validates email and password before calling the server', async () => {
  render(<AuthPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('valid email')
  await userEvent.clear(screen.getByLabelText('Email'))
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter your password')
  expect(login).not.toHaveBeenCalled()
})

test('shows server errors from a failed login', async () => {
  login.mockRejectedValue(new Error('Incorrect email or password.'))
  render(<AuthPage />)
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
  await userEvent.type(screen.getByLabelText('Password'), 'whatever123')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  expect(login).toHaveBeenCalledWith('a@b.co', 'whatever123')
})

test('registration enforces the 10 character minimum and submits the name', async () => {
  register.mockResolvedValue(undefined)
  render(<AuthPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await userEvent.type(screen.getByLabelText('Name'), 'Ada')
  await userEvent.type(screen.getByLabelText('Email'), 'ada@x.io')
  await userEvent.type(screen.getByLabelText('Password'), 'short1')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at least 10')
  await userEvent.clear(screen.getByLabelText('Password'))
  await userEvent.type(screen.getByLabelText('Password'), 'LongEnough123')
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(register).toHaveBeenCalledWith('Ada', 'ada@x.io', 'LongEnough123')
})
