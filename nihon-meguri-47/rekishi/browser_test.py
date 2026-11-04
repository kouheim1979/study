"""Offline Chromium UI regression tests.
Uses the real HTML/CSS/JS with a localStorage test double; makes no network calls.
Requires Python + playwright and a Chromium executable. Run from any directory:
  python rekishi/browser_test.py
Set CHROMIUM_PATH to select another Chromium binary. This is not an iOS Safari test.
"""
from pathlib import Path
import json, os, re, shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
KEY = 'ijin-birthplace-v1'
HTML = (ROOT / 'index.html').read_text()
HTML = re.sub(r'<script defer src="[^\"]+"></script>', '', HTML)
HTML = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>' + (ROOT/m[1].split('?')[0]).read_text() + '</style>', HTML)
checks = []

def check(condition, label):
    assert condition, label
    checks.append(label)

def boot(browser, width=390, initial=None, denied=False):
    page = browser.new_page(viewport={'width': width, 'height': 844}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(HTML)
    page.evaluate('''({initial, denied}) => {
      window.__saved = initial || {};
      Object.defineProperty(window, 'localStorage', {value: {
        getItem(k) {if(denied) throw new DOMException('denied', 'SecurityError'); return window.__saved[k] ?? null;},
        setItem(k,v) {if(denied) throw new DOMException('denied', 'SecurityError'); window.__saved[k]=String(v);}
      }});
    }''', {'initial': initial, 'denied': denied})
    for name in ['data', 'core', 'app']:
        page.add_script_tag(content=(ROOT/(name+'.js')).read_text())
    page.__errors = errors
    return page

def data(page):
    return page.evaluate('(k)=>JSON.parse(window.__saved[k])', KEY)

def person(page):
    name=page.locator('#person-name').inner_text()
    return page.evaluate('(n)=>BirthplaceData.PEOPLE.find(p=>p.name===n)', name)

def choose_correct(page):
    pref=person(page)['pref']
    page.locator('.choice').filter(has_text=pref).click()

def no_overflow(page, label):
    check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),label)

with sync_playwright() as p:
    binary=os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    launch={'headless':True,'args':['--no-sandbox']}
    if binary: launch['executable_path']=binary
    browser=p.chromium.launch(**launch)
    page=boot(browser,initial={'other-app':'DO NOT CHANGE'})
    check(page.title().startswith('偉人のふるさと'), 'title and initial render')
    check(page.locator('#review-start').is_disabled(), 'empty review button disabled')
    page.locator('#count').select_option('5')
    page.locator('#start').click()
    check(page.locator('.choice').count()==4, 'four choices render')
    check(page.locator('#feedback-slot').inner_text()=='', 'no answer shown before selection')
    first=person(page)
    wrong=next(x for x in page.locator('.choice-label').all_text_contents() if x!=first['pref'])
    page.locator('.choice').filter(has_text=wrong).click()
    check(page.locator('.choice.wrong').count()==1 and page.locator('.choice.correct').count()==1,'wrong and correct choices both identified')
    check(page.locator('.choice:disabled').count()==4,'answers lock after selection')
    check(data(page)['answered']==1,'first answer stored once')
    page.evaluate("document.querySelector('.choice').click(); document.querySelector('.choice').click()")
    check(data(page)['answered']==1,'repeat click does not duplicate record')
    check(page.locator('.feedback .source').get_attribute('rel')=='noopener noreferrer','source link isolated')
    page.locator('#next').click()
    second=person(page)
    page.locator('#hint').click()
    check(page.locator('.choice:not(:disabled)').count()==2,'hint leaves exactly two choices')
    check(page.locator('.choice:not(:disabled)').filter(has_text=second['pref']).count()==1,'hint preserves correct answer')
    choose_correct(page)
    check(page.locator('.points').inner_text()=='50点','hinted answer receives half points')
    check(second['id'] in data(page)['review'],'hinted correct stays in review')
    for i in range(3):
        page.locator('#next').click()
        choose_correct(page)
    page.locator('#next').click()
    check(page.locator('.score-inner b').inner_text()=='70','mixed five-question score is 70')
    check(data(page)['rounds']==1 and data(page)['correct']==4,'round completes exactly once')
    check(page.locator('.answer-item').count()==5,'result review contains every question')
    check(len(data(page)['review'])==2 and len(data(page)['mastered'])==3,'mastery and review are disjoint')
    page.locator('#copy').click()
    check(page.locator('.copy-fallback').count()==1,'clipboard-denied fallback works')
    page.locator('#retry').click()
    seen=[]
    for i in range(2):
        seen.append(person(page)['id'])
        choose_correct(page)
        page.locator('#next').click()
    check(set(seen)=={first['id'],second['id']},'retry contains only mistakes and hinted people')
    check(len(data(page)['review'])==0,'successful unassisted retry clears review')
    check(data(page)['best']==100 and data(page)['rounds']==2,'best score and completed rounds saved')
    page.locator('.tabs [data-nav=book]').click()
    check(page.locator('.person-entry').count()==81,'library contains all 81 people')
    page.locator('#book-search').fill('リョウマ')
    check(page.locator('.person-entry').count()==1 and '坂本龍馬' in page.locator('.person-entry').inner_text(),'katakana search matches reading')
    page.locator('#book-search').fill('<script>alert(1)</script>')
    check(page.locator('.empty').count()==1,'unknown search is empty and safe')
    page.locator('#book-search').fill('')
    page.locator('#book-group').select_option('warrior')
    check(page.locator('.person-entry').count()==8,'library category filters correctly')
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':844})
        no_overflow(page,f'library no horizontal overflow at {width}px')
    page.locator('.tabs [data-nav=record]').click()
    check(page.locator('.person-stamp').count()==81,'81 passport entries')
    check(page.locator('.person-stamp.collected').count()==5,'earned stamps match progress')
    saved=page.evaluate('window.__saved')
    restored=boot(browser,initial=saved)
    check('5' in restored.locator('.stat').first.inner_text(),'progress restored on fresh app boot')
    restored.close()
    page.locator('#reset').click()
    page.locator('#cancel-reset').click()
    check(data(page)['answered']==7,'cancel reset preserves progress')
    page.locator('#reset').click()
    page.locator('#confirm-reset').click()
    check(data(page)['answered']==0 and page.evaluate("__saved['other-app']")=='DO NOT CHANGE','reset only affects own storage key')
    page.locator('.tabs [data-nav=home]').click()
    page.locator('#course').select_option('warrior')
    page.locator('#count').select_option('20')
    check(page.locator('#start-summary').inner_text().startswith('8問'),'course caps actual count visibly')
    page.locator('#start').click()
    for width in [320,390,768,1280]:
        page.set_viewport_size({'width':width,'height':844})
        no_overflow(page,f'quiz no horizontal overflow at {width}px')
    page.once('dialog',lambda d:d.dismiss())
    page.locator('.tabs [data-nav=book]').click()
    check(page.locator('#person-name').count()==1,'cancel leave preserves current question')
    page.once('dialog',lambda d:d.accept())
    page.locator('.tabs [data-nav=home]').click()
    check(page.locator('#start').count()==1,'confirm leave returns home')
    check(not page.__errors,'no browser JavaScript errors in main flows')
    page.close()
    denied=boot(browser,denied=True)
    check(denied.locator('#storage-notice').is_visible(),'storage denied shows nonfatal notice')
    denied.locator('#count').select_option('5')
    denied.locator('#start').click()
    for i in range(5):choose_correct(denied);denied.locator('#next').click()
    check(denied.locator('.score-inner b').inner_text()=='100','full round works with storage disabled')
    check(not denied.__errors,'storage denial causes no uncaught error')
    denied.close()
    malformed=boot(browser,initial={KEY:'{malformed'})
    check(malformed.locator('#start').is_visible(),'malformed saved JSON does not block the game')
    malformed.close()
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
