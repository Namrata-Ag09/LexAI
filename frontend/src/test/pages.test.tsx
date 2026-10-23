import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api, ApiError } from '../api'
import { ChatPanel } from '../components/Chat'
import Search from '../pages/Search'

vi.mock('../api', async (orig) => {
  const m = await orig<typeof import('../api')>()
  const fn = () => vi.fn()
  return { ...m, api: { documents: fn(), search: fn(), conversations: fn(), conversation: fn(), newConversation: fn(), ask: fn(), deleteConversation: fn() } }
})
const A = vi.mocked(api) as any

const hit = (id: number, text: string) => ({ chunk_id: id, document_id: 1, document_title: 'MSA', version_id: 1, version_number: 1, page: 2, excerpt: text, score: 0.83 })

beforeEach(() => { Object.values(A).forEach((f: any) => f.mockReset()); A.documents.mockResolvedValue({ items: [{ id: 1, title: 'MSA' }], total: 1 }) })

test('search renders real result passages with highlighted terms and a score', async () => {
  A.search.mockResolvedValue({ query: 'terminate', terms: ['terminate'], total: 1, page: 1, per_page: 10, results: [hit(11, 'Either party may terminate on notice.')] })
  render(<MemoryRouter initialEntries={['/search?q=terminate']}><Search /></MemoryRouter>)
  expect(await screen.findByText('1 passage found')).toBeInTheDocument()
  expect(screen.getByText('83%')).toBeInTheDocument()
  expect(document.querySelector('.snippet mark')?.textContent).toBe('terminate')
  expect(A.search).toHaveBeenCalledWith('terminate', expect.objectContaining({ scope: 'current', page: 1 }))
})

test('search shows empty state, then an error with a working retry', async () => {
  A.search.mockResolvedValueOnce({ query: 'x', terms: [], total: 0, page: 1, per_page: 10, results: [] })
  const { unmount } = render(<MemoryRouter initialEntries={['/search?q=nothing']}><Search /></MemoryRouter>)
  expect(await screen.findByText('No matching passages')).toBeInTheDocument()
  unmount()
  A.search.mockRejectedValueOnce(new ApiError('AI features are not configured.', 503, 'ai_not_configured'))
  A.search.mockResolvedValueOnce({ query: 'y', terms: [], total: 1, page: 1, per_page: 10, results: [hit(1, 'text')] })
  render(<MemoryRouter initialEntries={['/search?q=again']}><Search /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('not configured')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('1 passage found')).toBeInTheDocument()
})

test('chat shows answer with expandable citation from the backend response', async () => {
  A.conversations.mockResolvedValue({ items: [] })
  A.newConversation.mockResolvedValue({ conversation: { id: 5, title: 'New conversation', document_id: 1, updated_at: '' } })
  const cit = { ...hit(11, 'Either party may terminate this Agreement on 30 days notice.'), quote: 'terminate this Agreement on 30 days', number: 1 }
  A.ask.mockResolvedValue({
    user_message: { id: 1, role: 'user', content: 'Can I terminate?', citations: [], sufficient: null, sources: [], created_at: '' },
    assistant_message: { id: 2, role: 'assistant', content: 'Yes, on 30 days notice [1].', citations: [cit], sufficient: true, sources: [], created_at: '' }, disclaimer: '',
  })
  render(<MemoryRouter><ChatPanel documentId={1} /></MemoryRouter>)
  await userEvent.type(await screen.findByLabelText('Your question'), 'Can I terminate?')
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
  expect(await screen.findByText('Yes, on 30 days notice [1].')).toBeInTheDocument()
  expect(A.newConversation).toHaveBeenCalledWith(1)
  await userEvent.click(screen.getByRole('button', { name: /MSA/ }))
  expect(screen.getByText('terminate this Agreement on 30 days').tagName).toBe('MARK')
})

test('chat failure keeps the question retryable and recovers', async () => {
  A.conversations.mockResolvedValue({ items: [] })
  A.newConversation.mockResolvedValue({ conversation: { id: 6, title: 'New conversation', document_id: null, updated_at: '' } })
  A.ask.mockRejectedValueOnce(new ApiError('Could not reach Gemini.', 502, 'ai_error'))
  A.ask.mockResolvedValueOnce({
    user_message: { id: 1, role: 'user', content: 'Hello there?', citations: [], sufficient: null, sources: [], created_at: '' },
    assistant_message: { id: 2, role: 'assistant', content: 'I couldn’t find enough support.', citations: [], sufficient: false, sources: [hit(3, 'nearby text')], created_at: '' }, disclaimer: '' })
  render(<MemoryRouter><ChatPanel /></MemoryRouter>)
  await userEvent.type(await screen.findByLabelText('Your question'), 'Hello there?')
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach Gemini.')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.getByText(/couldn’t find enough support/)).toBeInTheDocument())
  expect(screen.getByText(/Closest passages retrieved \(1\)/)).toBeInTheDocument()
  expect(A.ask).toHaveBeenCalledTimes(2)
})
