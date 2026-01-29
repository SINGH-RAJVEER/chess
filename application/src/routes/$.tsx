import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/$')({
  component: NotFound,
})

function NotFound() {
  return (
    <div class="p-4 text-center">
      <h1 class="text-2xl font-bold">404 - Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  )
}
