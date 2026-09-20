// public/ 을 gh-pages 브랜치로 배포한다(GitHub Pages 소스 = gh-pages 브랜치). 사용: npm run deploy
import { execSync } from 'node:child_process';
const run = c => { console.log('$ ' + c); execSync(c, { stdio: 'inherit' }); };
run('npm run check'); run('npm test');
run('git subtree split --prefix public -b gh-pages-tmp');
try { run('git push -f origin gh-pages-tmp:gh-pages'); } finally { run('git branch -D gh-pages-tmp'); }
console.log('배포 완료: https://scienceisjo.github.io/todays-haenuri/  (반영까지 1~2분)');
