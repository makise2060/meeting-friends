(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sprites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SPRITES = [
    {
      id: 'dog',
      name: '小狗',
      palette: { '#': '#4a3222', a: '#d9a066', b: '#b5793f', w: '#ffffff', k: '#2b2b2b', p: '#e88484' },
      rows: [
        '................',
        '..##........##..',
        '.#bb#......#bb#.',
        '.#bb#......#bb#.',
        '.#aab######baa#.',
        '.#aaaaaaaaaaaa#.',
        '.#aakkaaaakkaa#.',
        '.#aakkaaaakkaa#.',
        '.#aaaaappaaaaa#.',
        '.#aaaaaaaaaaaa#.',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..##.##..##.##..',
        '................'
      ]
    },
    {
      id: 'cat',
      name: '小猫',
      palette: { '#': '#3d3d46', a: '#9aa0aa', b: '#727884', w: '#ffffff', k: '#2b2b2b', p: '#f2a2ab' },
      rows: [
        '..#..........#..',
        '..#a#......#a#..',
        '.#aab#....#baa#.',
        '.#aab######baa#.',
        '.#aaaaaaaaaaaa#.',
        '.#aakkaaaakkaa#.',
        '.#aakkaaaakkaa#.',
        '.#aaaaappaaaaa#.',
        '.#aaaaaaaaaaaa#.',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aa#aaaa#aa#..',
        '..##.##..##.##..',
        '................',
        '................'
      ]
    },
    {
      id: 'rabbit',
      name: '小兔',
      palette: { '#': '#5a4a55', a: '#f2eef0', b: '#d9d0d6', w: '#ffffff', k: '#2b2b2b', p: '#f2a2ab' },
      rows: [
        '....##...##.....',
        '...#ab#.#ba#....',
        '...#ab#.#ba#....',
        '...#aa#.#aa#....',
        '..#aaaaaaaaaa#..',
        '.#aaaaaaaaaaaa#.',
        '.#aakkaaaakkaa#.',
        '.#aakkaaaakkaa#.',
        '.#aaaaappaaaaa#.',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aaaaaaaaaa#..',
        '..#aa#aaaa#aa#..',
        '..##.##..##.##..',
        '................',
        '................'
      ]
    },
    {
      id: 'fox',
      name: '狐狸',
      palette: { '#': '#5a2f1a', a: '#e8833a', b: '#c8641f', w: '#fff6ea', k: '#2b2b2b', p: '#33251f' },
      rows: [
        '..##........##..',
        '.#aa#......#aa#.',
        '.#aab#....#baa#.',
        '.#aab######baa#.',
        '.#aakkaaaakkaa#.',
        '.#aakkaaaakkaa#.',
        '.#aaawwwwwwaaa#.',
        '.#aaawwppwwaaa#.',
        '.#aaawwwwwwaaa#.',
        '..#aaaaaaaaaa#..',
        '..#aawwwwwwaa#..',
        '..#aawwwwwwaa#..',
        '..#aa#aaaa#aa#..',
        '..##.##..##.##..',
        '................',
        '................'
      ]
    },
    {
      id: 'mouse',
      name: '米奇',
      palette: { '#': '#1a1a1a', k: '#2f3037', w: '#f7f4ef', r: '#d64545', y: '#f2c14e', p: '#f2a2ab' },
      rows: [
        '..####....####..',
        '.#kkkk#..#kkkk#.',
        '.#kkkk#..#kkkk#.',
        '..##kk####kk##..',
        '.#kkkkkkkkkkkk#.',
        '.#kkwwwwwwwwkk#.',
        '.#kkwkwwwwkwkk#.',
        '.#kkwwwwwwwwkk#.',
        '.#kkwwwkkwwwkk#.',
        '.#kkkkkkkkkkkk#.',
        '..#kkkkkkkkkk#..',
        '..#kkkkkkkkkk#..',
        '..#rrrrrrrrrr#..',
        '..#rrrrrrrrrr#..',
        '..#yyyy##yyyy#..',
        '................'
      ]
    },
    {
      id: 'coriander',
      name: '香菜',
      palette: { '#': '#1f4a24', a: '#6fbf5a', b: '#4a943c', w: '#ffffff', k: '#1f2a1c', p: '#f2a2ab' },
      rows: [
        '....##..##......',
        '...#aa##aa#.....',
        '..#aab####baa#..',
        '..#aaaaaaaaaa#..',
        '...#aa####aa#...',
        '....#aaaaaa#....',
        '.....#aaaa#.....',
        '....#aaaaaa#....',
        '...#aaaaaaaa#...',
        '...#akkaakka#...',
        '...#akkaakka#...',
        '...#aaappaaa#...',
        '....#aaaaaa#....',
        '.....#aaaa#.....',
        '....##.##.##....',
        '................'
      ]
    },
    {
      id: 'persimmon',
      name: '柿子',
      palette: { '#': '#5a3316', a: '#f0913a', b: '#e0722a', w: '#fff2e0', k: '#2b1c10', p: '#f7c04a', g: '#5e9b3f' },
      rows: [
        '.....####.......',
        '.....#gg#.......',
        '..#g##gg##g#....',
        '.#aaaaaaaaaa#...',
        '.#aaabbbbaaa#...',
        '.#aabbbbbbaa#...',
        '.#akkaaaakka#...',
        '.#akkaaaakka#...',
        '.#aaaappaaaa#...',
        '.#aabbbbbbaa#...',
        '..#aaaaaaaa#....',
        '..#aabbbbaa#....',
        '...#aaaaaa#.....',
        '....######......',
        '................',
        '................'
      ]
    },
    {
      id: 'stump',
      name: '西木',
      palette: { '#': '#3a2a1e', a: '#a9713f', b: '#8a5730', w: '#ffffff', k: '#2b1c10', p: '#f2a2ab', g: '#6fbf5a' },
      rows: [
        '....#.....#.....',
        '...#g#...#g#....',
        '..#gg#..#gg#....',
        '.#aaaaaaaaaa#...',
        '.#abbbbbbbba#...',
        '.#aabbbbbbaa#...',
        '.#aaaaaaaaaa#...',
        '.#akkaaaakka#...',
        '.#akkaaaakka#...',
        '.#aaaappaaaa#...',
        '.#aabbbbbbaa#...',
        '.#abbbbbbbba#...',
        '.############...',
        '................',
        '................',
        '................'
      ]
    }
  ];

  const byId = {};
  for (const s of SPRITES) byId[s.id] = s;

  function draw(canvas, sprite, scale) {
    const h = sprite.rows.length;
    const w = sprite.rows[0].length;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = sprite.rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        octx.fillStyle = sprite.palette[ch] || '#ff00ff';
        octx.fillRect(x, y, 1, 1);
      }
    }
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  return { list: SPRITES, byId, draw };
});
