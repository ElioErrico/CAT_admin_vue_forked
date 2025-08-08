import hljs from 'highlight.js'
import { Remarkable } from 'remarkable'
import { linkify } from 'remarkable/linkify'
// Fix the KaTeX import with explicit type import
import katex from 'katex'
import type { KatexOptions } from 'katex'
import 'katex/dist/katex.min.css'

// Function to render inline math: \( ... \)
const renderInlineMath = (content: string) => {
  try {
    return katex.renderToString(content, { displayMode: false })
  } catch (error) {
    console.error('KaTeX error:', error)
    return `<span class="text-error">${content}</span>`
  }
}

// Function to render display math: \[ ... \]
const renderDisplayMath = (content: string) => {
  try {
    return katex.renderToString(content, { displayMode: true })
  } catch (error) {
    console.error('KaTeX error:', error)
    return `<div class="text-error">${content}</div>`
  }
}

const markdown = new Remarkable({
	html: true,
	breaks: true,
	xhtmlOut: true,
	typographer: true,
	highlight: (str, lang) => {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return hljs.highlight(str, { language: lang }).value
			} catch (_) {
				console.log(_)
			}
		}
		try {
			return hljs.highlightAuto(str).value
		} catch (_) {
			console.log(_)
		}
		return '' // use external default escaping
	},
}).use(linkify)

markdown.inline.ruler.enable(['sup', 'sub'])
markdown.core.ruler.enable(['abbr'])
markdown.block.ruler.enable(['footnote', 'deflist'])

// Process the rendered HTML to handle math formulas
const renderWithMath = (text: string) => {
  // First handle display math (multiline formulas)
  let processedText = text.replace(/\\\[(.*?)\\\]/gs, (_, formula) => 
    renderDisplayMath(formula.trim())
  )
  
  // Then handle inline math (single line formulas)
  processedText = processedText.replace(/\\\((.*?)\\\)/gs, (_, formula) => 
    renderInlineMath(formula.trim())
  )

  // Finally render markdown
  return markdown.render(processedText)
}

export default {
  render: renderWithMath
}
