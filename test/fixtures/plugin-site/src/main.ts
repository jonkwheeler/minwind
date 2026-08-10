import './emitted.css'
import { App } from './render'

const root = document.getElementById('root')
if (root !== null) root.textContent = String(App)
