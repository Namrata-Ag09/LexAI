import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError, uploadFile } from '../api'
import { Uploader, validateFile } from '../components/Uploader'

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), uploadFile: vi.fn() }))
const up = vi.mocked(uploadFile)
beforeEach(() => { up.mockReset(); up.mockResolvedValue({ document: { id: 0, title: "" } }) })

const file = (name: string, size = 100) => new File([new Uint8Array(size)], name)
const drop = (f: File) => fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [f] } })

test('validateFile rules', () => {
  expect(validateFile(file('a.pdf'), 25)).toBeNull()
  expect(validateFile(file('a.DOCX'), 25)).toBeNull()
  expect(validateFile(file('a.txt'), 25)).toMatch(/not supported/)
  expect(validateFile(file('a.pdf', 0), 25)).toMatch(/empty/)
  expect(validateFile(file('a.pdf', 3 * 1048576), 2)).toMatch(/larger than 2 MB/)
})

test('rejects unsupported files without calling the server', () => {
  render(<Uploader onUploaded={vi.fn()} />)
  drop(file('notes.txt'))
  expect(screen.getByRole('alert')).toHaveTextContent('not supported')
  expect(up).not.toHaveBeenCalled()
})

test('uploads a dropped PDF and reports success', async () => {
  const onUploaded = vi.fn()
  up.mockImplementation(async (_p, _f, _x, progress) => { progress?.(50); return { document: { id: 1, title: 'x' } } })
  render(<Uploader onUploaded={onUploaded} />)
  drop(file('contract.pdf'))
  await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ id: 1, title: 'x' }))
  expect(up.mock.calls[0][0]).toBe('/api/documents')
})

test('uses the versions endpoint for new versions and surfaces server errors', async () => {
  up.mockImplementation(() => Promise.reject(new ApiError('The file does not look like a valid PDF.', 422, 'invalid_file')))
  render(<Uploader documentId={5} onUploaded={vi.fn()} />)
  drop(file('bad.pdf'))
  expect(await screen.findByRole('alert')).toHaveTextContent('does not look like a valid PDF')
  expect(up.mock.calls[0][0]).toBe('/api/documents/5/versions')
})
