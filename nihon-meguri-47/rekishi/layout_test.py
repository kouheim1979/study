"""Offline touch/viewport regressions for the compact quiz layout.
Run: python rekishi/layout_test.py
Optional: QUIZ_ROOT=/path/to/old/rekishi to prove the regression fails before the fix.
Chromium emulation is not a test on a physical iPhone/Safari.
"""
from pathlib import Path
import json
import os
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(os.getenv('QUIZ_ROOT', Path(__file__).resolve().parent))
KEY = 'ijin-birthplace-v1'
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<script defer src="[^"]+"></script>', '', html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
              lambda m: '<style>' + (ROOT/m[1].split('?')[0]).read_text() + '</style>', html)
checks = []


def check(ok, message):
    assert ok, message
    checks.append(message)


def boot(browser, width=390, height=664, touch=True):
    page = browser.new_page(viewport={'width': width, 'height': height},
                            is_mobile=touch, has_touch=touch, reduced_motion='no-preference')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/*', lambda route: route.abort())
    page.set_content(html)
    page.evaluate('''() => {
        window.__saved = {'other-app':'KEEP'};
        Object.defineProperty(window, 'localStorage', {value: {
          getItem(k) { return window.__saved[k] ?? null; },
          setItem(k,v) { window.__saved[k] = String(v); }
        }});
    }''')
    for name in ('data', 'core', 'app'):
        page.add_script_tag(content=(ROOT/(name + '.js')).read_text())
    page.__errors = errors
    page.locator('#count').select_option('5')
    page.locator('#start').click()
    return page


def answer(page, correct=True):
    # Avoid locator.click() auto-scrolling: it can conceal an off-screen button.
    page.evaluate('''(correct) => {
        const p = BirthplaceData.PEOPLE.find(p => p.name === document.querySelector('#person-name').textContent);
        const buttons = [...document.querySelectorAll('.choice:not(:disabled)')];
        buttons.find(b => (b.querySelector('.choice-label').textContent === p.pref) === correct).click();
    }''', correct)


def next_box(page, label, safe_bottom=0):
    result = page.evaluate('''() => {
        const button = document.querySelector('#next'), r = button.getBoundingClientRect();
        const hits = [[.1,.5],[.5,.5],[.9,.5]].every(([x,y]) =>
          document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest('#next') === button);
        return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,
          visible:r.x>=0 && r.y>=0 && r.right<=innerWidth && r.bottom<=innerHeight,
          hits,position:getComputedStyle(button).position,viewport:innerHeight,
          overflow:document.documentElement.scrollWidth>innerWidth};
    }''')
    check(result['position'] == 'fixed' and result['visible'] and result['hits']
          and not result['overflow'] and result['height'] >= 44
          and result['bottom'] <= result['viewport'] - safe_bottom,
          label + ': next is fully visible, large enough and unobstructed ' + str(result))
    return result


def tap_next(page, label, safe_bottom=0):
    r = next_box(page, label, safe_bottom)
    page.touchscreen.tap(r['x'] + r['width']/2, r['y'] + r['height']/2)


with sync_playwright() as p:
    launch = {'headless': True, 'args': ['--no-sandbox']}
    binary = os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    if binary:
        launch['executable_path'] = binary
    browser = p.chromium.launch(**launch)
    for width, height in [(320,568), (375,548), (390,664), (430,740), (768,620), (844,390), (932,430)]:
        label = f'{width}x{height}'
        page = boot(browser, width, height)
        card = page.locator('.question-card').bounding_box()
        check(card['height'] <= 225, label + ': compact question card')
        if height >= 548:
            rect = page.locator('.choices').bounding_box()
            check(rect['y'] >= 0 and rect['y']+rect['height'] <= height,
                  label + ': all four answers fit without scrolling')
        answer(page, correct=False)
        next_box(page, label + ' immediately after answer (animations enabled)')
        for where in ('top', 'bottom'):
            page.evaluate("(where) => scrollTo({top:where==='top'?0:document.documentElement.scrollHeight,behavior:'instant'})", where)
            next_box(page, label + ' at scroll ' + where)
        source = page.locator('.feedback .source').bounding_box()
        action = page.locator('#next').bounding_box()
        check(source['y']+source['height'] < action['y'], label + ': source is readable above the fixed action')
        tap_next(page, label + ' real touch next')
        check(page.locator('.question-number b').inner_text() == '02', label + ': touch advances to question two')
        page.locator('#hint').click()
        answer(page)
        check(page.locator('#toast').is_visible(), label + ': hint toast is still on screen')
        tap_next(page, label + ' hint toast does not intercept touch')
        for n in range(3,6):
            answer(page)
            tap_next(page, label + f' question {n}')
        check(page.locator('.score-inner b').inner_text() == '70', label + ': correct score after final-button touch')
        check(page.locator('#next').count() == 0, label + ': fixed action removed on results')
        record = page.evaluate('(key)=>JSON.parse(__saved[key])', KEY)
        check(record['answered'] == 5 and record['rounds'] == 1
              and page.evaluate("__saved['other-app']") == 'KEEP', label + ': no duplicate records or changes to other apps')
        page.locator('.brand').click()
        check(page.locator('.tabs').is_visible(), label + ': navigation restored at home')
        check(not page.__errors, label + ': no JavaScript error')
        page.close()

    page = boot(browser)
    answer(page)
    page.evaluate("document.documentElement.style.setProperty('--quiz-safe-bottom','34px')")
    for width,height in [(390,520),(390,740),(844,390),(390,664)]:
        page.set_viewport_size({'width':width,'height':height})
        next_box(page, f'resize/orientation {width}x{height} with simulated home indicator', 34)
    page.evaluate("document.documentElement.style.setProperty('--quiz-safe-left','44px');document.documentElement.style.setProperty('--quiz-safe-right','44px')")
    r = next_box(page, 'simulated landscape side safe areas', 34)
    check(r['x'] >= 44 and r['x']+r['width'] <= 390-44, 'button respects both side safe areas')
    tap_next(page, 'tap after viewport changes', 34)
    page.close()

    # Desktop keeps the original in-flow layout; no fixed action leaks to other screens.
    page = boot(browser, 1280, 900, touch=False)
    answer(page)
    check(page.locator('#next').evaluate("b=>getComputedStyle(b).position") == 'static', 'desktop next remains in the explanation')
    check(page.locator('.tabs').is_visible(), 'desktop navigation preserved')
    page.close()
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks}, ensure_ascii=False, indent=2))
