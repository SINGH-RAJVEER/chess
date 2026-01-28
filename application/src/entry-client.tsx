import { StartClient } from '@tanstack/solid-start/client'
import { hydrate } from 'solid-js/web'
import { createRouter } from './router'

const router = createRouter()

hydrate(() => <StartClient router={router} />, document)
