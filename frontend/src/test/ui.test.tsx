import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Citation, fmtBytes, Highlight, QuoteHighlight } from '../components/ui'

const passage = {
  chunk_id: 7, document_id: 3, document_title: 'Services Agreement', version_id: 9, version_number: 2, page: 4,
  excerpt: 'Either party may terminate this Agreement upon thirty days written notice.', quote: 'terminate this Agreement upon thirty days', number: 1,
}

test('Highlight marks matching terms case-insensitively', () => {
  const { container } = render(<Highlight text="Termination and TERMINATE" terms={['terminat']} />)
  expect(container.querySelectorAll('mark')).toHaveLength(2)
})

test('Highlight with no terms renders plain text', () => {
  const { container } = render(<Highlight text="plain" terms={[]} />)
  expect(container.querySelector('mark')).toBeNull()
  expect(container).toHaveTextContent('plain')
})

test('QuoteHighlight tolerates whitespace differences', () => {
  const { container } = render(<QuoteHighlight text={'a  b\nc d e'} quote="b c d" />)
  expect(container.querySelector('mark')?.textContent).toBe('b\nc d')
})

test('Citation expands to show the source passage and a link to the document', async () => {
  render(<MemoryRouter><Citation c={passage} /></MemoryRouter>)
  expect(screen.queryByRole('link')).toBeNull()
  const head = screen.getByRole('button', { name: /Services Agreement/ })
  expect(head).toHaveAttribute('aria-expanded', 'false')
  expect(head).toHaveTextContent('v2 · p. 4')
  await userEvent.click(head)
  expect(head).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('terminate this Agreement upon thirty days').tagName).toBe('MARK')
  expect(screen.getByRole('link', { name: /Open in document/ })).toHaveAttribute('href', '/documents/3?tab=text&v=9&page=4&chunk=7')
})

test('fmtBytes', () => {
  expect(fmtBytes(500)).toBe('1 KB')
  expect(fmtBytes(2 * 1048576)).toBe('2.0 MB')
})
