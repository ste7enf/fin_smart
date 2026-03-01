const localtunnel = require('localtunnel');

(async () => {
  const tunnel = await localtunnel({ 
    port: 8080,
    subdomain: 'nasdaq100-' + Math.random().toString(36).substring(2, 8)
  });
  
  console.log('==========================================');
  console.log('内网穿透已启动');
  console.log('==========================================');
  console.log('公网访问地址:', tunnel.url);
  console.log('==========================================');
  console.log('手机扫描二维码或直接访问上述地址');
  console.log('==========================================');
  
  tunnel.on('close', () => {
    console.log('隧道已关闭');
  });
})();
