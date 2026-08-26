#!/usr/bin/env python3
"""Bundle index.html + app.js + the icon into one file you can open from anywhere.

    python3 build-standalone.py

Writes tutoring-standalone.html — no server, no sibling files, works from
file:// or an email attachment on a phone.
"""
import base64
import pathlib
import re

here = pathlib.Path(__file__).parent
html = (here / 'index.html').read_text()
js = (here / 'app.js').read_text()
icon = base64.b64encode((here / 'apple-touch-icon.png').read_bytes()).decode()

# The manifest and icon files won't exist next to a standalone copy: inline the
# touch icon and drop the manifest link.
html = html.replace('<link rel="manifest" href="manifest.json" />\n', '')
html = html.replace('href="apple-touch-icon.png"', 'href="data:image/png;base64,%s"' % icon)
html = html.replace('<title>', '<link rel="icon" href="data:image/png;base64,%s" />\n<title>' % icon, 1)

# Inline the script. A literal </script> inside a string would end the block early.
tag = '<script src="app.js"></script>'
assert html.count(tag) == 1, 'could not find the app.js script tag'
js_safe = js.replace('</script>', '<\\/script>')
html = html.replace(tag, '<script>\n' + js_safe + '\n</script>')

out = here / 'tutoring-standalone.html'
out.write_text(html)
print('wrote %s (%.0f KB)' % (out.name, out.stat().st_size / 1024))
