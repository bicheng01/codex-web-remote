import QRCode from 'qrcode';
import {refresh} from './control.mjs';
try {
 const qr=await refresh();
 process.stdout.write(await QRCode.toString(qr.link,{type:'terminal',small:true}));
 console.log(`二维码已刷新，约 5 分钟有效。本机处理：${qr.elapsedMs} ms。`);
 console.log(`PNG: ${qr.imagePath}`);
} catch(e) {console.error(e.message);process.exitCode=1}
