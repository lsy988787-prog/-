// 生成测试用的双栏论文 PDF（内容为原创示例文字）。用法：node make_sample_pdf.js 输出路径
const { chromium } = require('playwright');
const para = (s) => `<p>${s}</p>`;
const lorem = (topic, n) => Array.from({ length: n }, (_, i) =>
  `The ${topic} is examined from a practical point of view in this paragraph number ${i + 1}. We describe how the operating point changes when the network impedance increases, and why the voltage at the receiving end becomes sensitive to reactive power. Such behaviour is well known to operators but rarely quantified for distribution feeders with high penetration of inverter based resources.`).map(para).join('');
const html = `<!doctype html><html><head><style>
@page { size: A4; margin: 18mm 15mm; }
body { font-family: 'Times New Roman', serif; font-size: 10pt; }
h1 { font-size: 18pt; text-align: center; margin: 0 0 6pt; }
.authors { text-align: center; font-size: 10pt; margin-bottom: 10pt; }
.cols { column-count: 2; column-gap: 8mm; text-align: justify; }
h2 { font-size: 12pt; font-weight: bold; margin: 8pt 0 4pt; }
.abstract { font-weight: normal; }
.eq { text-align: center; margin: 6pt 0; font-style: italic; }
.cap { font-size: 9pt; }
.ref { font-size: 8.5pt; }
</style></head><body>
<h1>Voltage Sensitivity of Distribution Feeders with Inverter Based Resources</h1>
<div class="authors">Alex Chen and Robin Li<br/>Department of Electrical Engineering, Example University</div>
<div class="cols">
<p class="abstract"><b>Abstract—</b>This paper studies how the voltage at the end of a radial distribution feeder responds to active and reactive power injected by inverter based resources. We derive a simple sensitivity expression from the voltage drop formula and validate it on a 33-bus test feeder. The results show that reactive power control remains effective only when the ratio of reactance to resistance is large.</p>
<h2>1 Introduction</h2>
${lorem('voltage regulation problem', 3)}
<h2>2 Sensitivity Model</h2>
${lorem('linearised feeder model', 2)}
<p class="eq">ΔU = (P R + Q X) / U₂ &nbsp;&nbsp;&nbsp; (1)</p>
${lorem('sensitivity coefficient', 2)}
<p class="cap">Fig. 1. Receiving end voltage versus injected reactive power for three X/R ratios.</p>
<h2>3 Case Study</h2>
${lorem('33-bus feeder case', 4)}
<p class="cap">Table 1. Parameters of the test feeder and the inverter ratings.</p>
<h2>4 Conclusion</h2>
${lorem('main finding', 1)}
<h2>References</h2>
<p class="ref">[1] A. Author, "A study of feeder voltage," Example Journal, vol. 1, pp. 1–10, 2020.</p>
<p class="ref">[2] B. Writer, "Reactive power control of inverters," Example Transactions, vol. 2, pp. 11–20, 2021.</p>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: process.argv[2], format: 'A4', displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px;width:100%;text-align:center">Example Transactions on Power Distribution</div>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span></div>',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await b.close();
})();
