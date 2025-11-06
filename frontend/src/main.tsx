import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Back to React Flow - it actually worked
import TestReactHeavy from './TestReactHeavy'
import TestReactFlow from './TestReactFlow'
import './index.css'

// Check URL to decide which component to render
const path = window.location.pathname;
const isTestHeavy = path === '/test-heavy';
const isTestFlow = path === '/test-flow';

let ComponentToRender = App;
if (isTestHeavy) ComponentToRender = TestReactHeavy;
if (isTestFlow) ComponentToRender = TestReactFlow;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ComponentToRender />
  </React.StrictMode>,
)

