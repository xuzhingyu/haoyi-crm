import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { media, renderContent } from './report/content.mjs';

// Standalone report: real source images and OFL-licensed, subset typography.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = process.env.REPORT_ASSET_ROOT || resolve(root, 'docs/report-assets/2026-11-06');
const fontPath = process.env.REPORT_FONT_PATH || 'C:/Windows/Fonts/NotoSansSC-VF.ttf';
const workspaceHref = process.env.REPORT_WORKSPACE_HREF || '/haoyi/';
if (!/^(https?:\/\/|\/|\.\/)/.test(workspaceHref)) throw new Error('REPORT_WORKSPACE_HREF must be HTTP(S) or a relative URL');
const esc = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function imageDimensions(bytes, mime) {
  if (mime === 'image/png') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error('Unable to read image dimensions');
}
const assets = Object.fromEntries(Object.entries(media).map(([key, item]) => {
  const file = resolve(assetRoot, item.file);
  let bytes = readFileSync(file);
  let mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : null;
  if (!mime) throw new Error('Unsupported source image: ' + file);
  const dimensions = imageDimensions(bytes, mime);
  if (mime === 'image/png') {
    // Encode losslessly; original source files and all pixel content are preserved.
    const encoded = spawnSync(process.env.REPORT_PYTHON || 'python', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.stdout.buffer, format="WEBP", lossless=True, method=6)', file], { maxBuffer: 32 * 1024 * 1024 });
    if (encoded.status !== 0) throw new Error('Lossless image encoding failed: ' + file + ' ' + encoded.stderr.toString());
    if (encoded.stdout.length < bytes.length) { bytes = encoded.stdout; mime = 'image/webp'; }
  }
  return [key, { src: `data:${mime};base64,${bytes.toString('base64')}`, ...dimensions }];
}));

const ofl = "This Font Software is licensed under the SIL Open Font License,\nVersion 1.1.\n\nThis license is copied below, and is also available with a FAQ at:\nhttp://scripts.sil.org/OFL\n\n-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide\ndevelopment of collaborative font projects, to support the font\ncreation efforts of academic and linguistic communities, and to\nprovide a free and open framework in which fonts may be shared and\nimproved in partnership with others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and\nredistributed freely as long as they are not sold by themselves. The\nfonts, including any derivative works, can be bundled, embedded,\nredistributed and/or sold with any software provided that any reserved\nnames are not used by derivative works. The fonts and derivatives,\nhowever, cannot be released under any other type of license. The\nrequirement for fonts to remain under this license does not apply to\nany document created using the fonts or their derivatives.\n\nDEFINITIONS\n\"Font Software\" refers to the set of files released by the Copyright\nHolder(s) under this license and clearly marked as such. This may\ninclude source files, build scripts and documentation.\n\n\"Reserved Font Name\" refers to any names specified as such after the\ncopyright statement(s).\n\n\"Original Version\" refers to the collection of Font Software\ncomponents as distributed by the Copyright Holder(s).\n\n\"Modified Version\" refers to any derivative made by adding to,\ndeleting, or substituting -- in part or in whole -- any of the\ncomponents of the Original Version, by changing formats or by porting\nthe Font Software to a new environment.\n\n\"Author\" refers to any designer, engineer, programmer, technical\nwriter or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining\na copy of the Font Software, to use, study, copy, merge, embed,\nmodify, redistribute, and sell modified and unmodified copies of the\nFont Software, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components, in\nOriginal or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled,\nredistributed and/or sold with any software, provided that each copy\ncontains the above copyright notice and this license. These can be\nincluded either as stand-alone text files, human-readable headers or\nin the appropriate machine-readable metadata fields within text or\nbinary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font\nName(s) unless explicit written permission is granted by the\ncorresponding Copyright Holder. This restriction only applies to the\nprimary font name as presented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font\nSoftware shall not be used to promote, endorse or advertise any\nModified Version, except to acknowledge the contribution(s) of the\nCopyright Holder(s) and the Author(s) or with their explicit written\npermission.\n\n5) The Font Software, modified or unmodified, in part or in whole,\nmust be distributed entirely under this license, and must not be\ndistributed under any other license. The requirement for fonts to\nremain under this license does not apply to any document created using\nthe Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are\nnot met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\nOF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE\nCOPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nINCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL\nDAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM\nOTHER DEALINGS IN THE FONT SOFTWARE.\n";

const styles = readFileSync(resolve(root, 'scripts/report/report.css'), 'utf8');
const client = readFileSync(resolve(root, 'scripts/report/report-client.js'), 'utf8');
let html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8fafc"><meta name="robots" content="noindex,nofollow"><meta name="description" content="AI 产品研发、软硬件协同、研发管理与客户交付：图像识别、养护智能体、智盒开发和政府平台项目经历。"><title>工作汇报 · AI 产品与软硬件研发</title><style>${styles}</style></head><body>${renderContent(assets, workspaceHref)}<script>${client}</script></body></html>`;
html = html.replace('__FONT_LICENSE__', esc(ofl));

const scratch=mkdtempSync(join(tmpdir(),'haoyi-report-font-'));
try {
  writeFileSync(join(scratch,'characters.txt'),Array.from(new Set(html+ofl)).join(''),'utf8');
  const python=String.raw`import json,sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
font_path, folder = sys.argv[1], Path(sys.argv[2])
font=TTFont(font_path)
copyright=sorted(set(n.toUnicode() for n in font['name'].names if n.nameID==0))
licenses=sorted(set(n.toUnicode() for n in font['name'].names if n.nameID in (13,14)))
if not any('Open Font License' in text for text in licenses): raise RuntimeError('Expected OFL-licensed font')
options=subset.Options(); options.name_IDs=['*']; options.name_languages=['*']; options.name_legacy=True
subsetter=subset.Subsetter(options=options)
subsetter.populate(text=(folder/'characters.txt').read_text(encoding='utf-8'))
subsetter.subset(font); font.flavor='woff2'; font.save(folder/'report.woff2')
(folder/'metadata.json').write_text(json.dumps({'copyright':copyright,'license':licenses},ensure_ascii=False),encoding='utf-8')
`;
  const result=spawnSync(process.env.REPORT_PYTHON||'python',['-X','utf8','-c',python,fontPath,scratch],{encoding:'utf8',maxBuffer:1024*1024});
  if(result.status!==0)throw new Error(`Font subsetting failed: ${result.stderr||result.error||'unknown error'}`);
  const metadata=JSON.parse(readFileSync(join(scratch,'metadata.json'),'utf8')),font=readFileSync(join(scratch,'report.woff2'));
  html=html.replace('__REPORT_FONT__',`data:font/woff2;base64,${font.toString('base64')}`).replace('__FONT_COPYRIGHT__',esc(metadata.copyright.join('\n')+'\n'+metadata.license.join('\n')));
  const output=resolve(root,'apps/franchise-portal/public/report.html');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,html,'utf8');
  console.log(`Report generated: ${output} (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB; embedded font ${(font.length/1024).toFixed(0)} KB)`);
} finally {
  // This unique directory was created above and verified to remain under Temp.
  if(dirname(scratch)===tmpdir()&&scratch.includes('haoyi-report-font-'))rmSync(scratch,{recursive:true});
}
