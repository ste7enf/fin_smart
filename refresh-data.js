#!/usr/bin/env node
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

// 日志文件路径
var LOG_FILE = path.join(__dirname, 'scheduler.log');

// 服务器配置
var SERVER_HOST = 'localhost';
var SERVER_PORT = 8080;

// 写入日志
function log(message) {
  var timestamp = new Date().toLocaleString();
  var logMessage = '[' + timestamp + '] ' + message + '\n';
  
  console.log(logMessage.trim());
  
  fs.appendFile(LOG_FILE, logMessage, function(err) {
    if (err) {
      console.error('写入日志失败:', err);
    }
  });
}

// 刷新股票数据
function refreshData() {
  return new Promise(function(resolve, reject) {
    log('开始刷新股票数据...');
    
    var options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/api/refresh',
      method: 'GET',
      timeout: 120000 // 2分钟超时，数据刷新可能需要较长时间
    };

    var req = http.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        try {
          var response = JSON.parse(data);
          if (response.status === 'ok') {
            log('数据刷新成功: ' + response.message);
            resolve(response);
          } else {
            log('数据刷新失败: ' + (response.message || '未知错误'));
            reject(new Error(response.message || '刷新失败'));
          }
        } catch (e) {
          log('解析响应失败: ' + e.message);
          reject(new Error('解析响应失败: ' + e.message));
        }
      });
    });

    req.on('error', function(error) {
      log('请求失败: ' + error.message);
      reject(new Error('请求失败: ' + error.message));
    });

    req.on('timeout', function() {
      req.destroy();
      log('请求超时');
      reject(new Error('请求超时'));
    });

    req.end();
  });
}

// 等待数据加载完成
function waitForDataReady() {
  return new Promise(function(resolve, reject) {
    var maxAttempts = 30; // 最多尝试30次
    var attempt = 0;
    var interval = 5000; // 每5秒检查一次
    
    function check() {
      attempt++;
      log('检查数据状态 (尝试 ' + attempt + '/' + maxAttempts + ')...');
      
      var options = {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/api/indexes?symbol=ndx&years=1',
        method: 'GET',
        timeout: 10000
      };

      var req = http.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) {
          data += chunk;
        });
        res.on('end', function() {
          try {
            var response = JSON.parse(data);
            if (response.index) {
              log('数据已就绪');
              resolve(response);
            } else if (response.status === 'error' && response.message.includes('加载中')) {
              if (attempt < maxAttempts) {
                log('数据加载中，' + (interval / 1000) + '秒后重试...');
                setTimeout(check, interval);
              } else {
                log('等待数据就绪超时');
                reject(new Error('等待数据就绪超时'));
              }
            } else {
              log('数据状态异常: ' + response.message);
              reject(new Error(response.message));
            }
          } catch (e) {
            log('解析响应失败: ' + e.message);
            reject(new Error('解析响应失败: ' + e.message));
          }
        });
      });

      req.on('error', function(error) {
        if (attempt < maxAttempts) {
          log('连接失败，' + (interval / 1000) + '秒后重试...');
          setTimeout(check, interval);
        } else {
          log('连接服务器失败: ' + error.message);
          reject(new Error('连接服务器失败: ' + error.message));
        }
      });

      req.on('timeout', function() {
        req.destroy();
        if (attempt < maxAttempts) {
          log('请求超时，' + (interval / 1000) + '秒后重试...');
          setTimeout(check, interval);
        } else {
          log('请求超时');
          reject(new Error('请求超时'));
        }
      });

      req.end();
    }
    
    check();
  });
}

// 主函数
function main() {
  log('========================================');
  log('股票数据定时刷新任务启动');
  log('========================================');
  
  refreshData()
    .then(function() {
      log('刷新请求已发送，等待数据加载完成...');
      return waitForDataReady();
    })
    .then(function() {
      log('========================================');
      log('任务完成');
      log('========================================');
      process.exit(0);
    })
    .catch(function(error) {
      log('========================================');
      log('任务失败: ' + error.message);
      log('========================================');
      process.exit(1);
    });
}

// 执行主函数
main();
