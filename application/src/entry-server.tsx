import { StartServer, createHandler } from '@tanstack/solid-start/server'
import { createRouter } from './router'

export default createHandler(() => {
  const router = createRouter()
  return <StartServer router={router} />
})
