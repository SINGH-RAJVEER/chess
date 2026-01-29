import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import { Suspense } from 'solid-js'
import { QueryClientProvider } from '@tanstack/solid-query'
import { queryClient } from '../lib/query'
import './../styles.css'

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div style={{ padding: '2rem', 'text-align': 'center' }}>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <pre style={{ 
        'text-align': 'left', 
        background: '#f5f5f5', 
        padding: '1rem', 
        'border-radius': '4px',
        overflow: 'auto'
      }}>
        {error.stack}
      </pre>
    </div>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Chess' },
    ],
  }),
  errorComponent: ErrorComponent,
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <Suspense>
            <Outlet />
          </Suspense>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}