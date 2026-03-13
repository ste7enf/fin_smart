'use strict';

var https = require('https');
var http = require('http');

// 飞书机器人配置
// 请替换为你的飞书机器人 webhook URL
var FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || '';

// 本地服务器地址
var SERVER_HOST = 'localhost';
var SERVER_PORT = 8080;

// 发送飞书消息
function sendFeishuMessage(content) {
  return new Promise(function(resolve, reject) {
    if (!FEISHU_WEBHOOK_URL) {
      console.error('错误: 未设置飞书机器人 webhook URL');
      console.error('请设置环境变量: export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx"');
      reject(new Error('未设置飞书机器人 webhook URL'));
      return;
    }

    var url = new URL(FEISHU_WEBHOOK_URL);
    var postData = JSON.stringify({
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          title: {
            tag: 'plain_text',
            content: '📈 纳斯达克100指数日报'
          },
          template: 'blue'
        },
        elements: content
      }
    });

    var options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        try {
          var response = JSON.parse(data);
          if (response.code === 0) {
            console.log('飞书消息发送成功');
            resolve(response);
          } else {
            console.error('飞书消息发送失败:', response);
            reject(new Error('飞书消息发送失败: ' + response.msg));
          }
        } catch (e) {
          console.error('解析飞书响应失败:', e);
          reject(e);
        }
      });
    });

    req.on('error', function(error) {
      console.error('发送飞书消息失败:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 获取纳斯达克100数据
function getNDXData() {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/api/indexes?symbol=ndx&years=1',
      method: 'GET'
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
            resolve(response.index);
          } else if (response.status === 'error') {
            reject(new Error('服务器数据未就绪: ' + (response.message || '未知错误')));
          } else {
            reject(new Error('获取数据失败: ' + (response.message || '未知错误')));
          }
        } catch (e) {
          reject(new Error('解析数据失败: ' + e.message));
        }
      });
    });

    req.on('error', function(error) {
      reject(new Error('连接服务器失败: ' + error.message));
    });

    req.setTimeout(30000, function() {
      req.destroy();
      reject(new Error('请求服务器超时'));
    });

    req.end();
  });
}

// 格式化百分比
function formatPercent(value) {
  if (value === undefined || value === null) return 'N/A';
  var percent = (value * 100).toFixed(2);
  return percent + '%';
}

// 格式化价格
function formatPrice(value) {
  if (value === undefined || value === null) return 'N/A';
  return value.toFixed(2);
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return dateStr;
}

// 计算当日涨跌
function calculateDailyChange(prices) {
  if (!prices || prices.length < 2) {
    return { change: 0, changePercent: 0 };
  }
  var currentPrice = prices[prices.length - 1];
  var previousPrice = prices[prices.length - 2];
  var change = currentPrice - previousPrice;
  var changePercent = change / previousPrice;
  return { change: change, changePercent: changePercent };
}

// 获取趋势图标
function getTrendIcon(change) {
  if (change > 0) {
    return '📈';
  } else if (change < 0) {
    return '📉';
  }
  return '➡️';
}

// 主函数
function main() {
  console.log('[' + new Date().toLocaleString() + '] 开始获取纳斯达克100数据...');

  getNDXData()
    .then(function(data) {
      console.log('数据获取成功，正在生成飞书消息...');

      var dailyChange = calculateDailyChange(data.data);
      var currentPrice = data.data[data.data.length - 1];
      var trendIcon = getTrendIcon(dailyChange.change);

      // 获取最新股票数据日期
      var latestDate = data.dates[data.dates.length - 1];

      var content = [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '📅 **股票数据日期: ' + formatDate(latestDate) + '**'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '**📊 当前价格: ' + formatPrice(currentPrice) + '**'
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: trendIcon + ' **当日涨跌: ' + (dailyChange.change >= 0 ? '+' : '') + formatPrice(dailyChange.change) + ' (' + formatPercent(dailyChange.changePercent) + ')**'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '📉 **当前回撤: ' + formatPercent(data.current_drawdown) + '**'
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '📉 **最大回撤: ' + formatPercent(data.max_drawdown) + '**'
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '⛰️ **历史最高: ' + formatPrice(data.peak) + ' (' + formatDate(data.peak_date) + ')**'
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '📆 **回撤形成天数: ' + data.formation_days + ' 天**'
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '🕐 推送时间: ' + new Date().toLocaleString()
          }
        }
      ];

      return sendFeishuMessage(content);
    })
    .then(function() {
      console.log('[' + new Date().toLocaleString() + '] 推送完成');
      process.exit(0);
    })
    .catch(function(error) {
      console.error('[' + new Date().toLocaleString() + '] 推送失败:', error.message);
      process.exit(1);
    });
}

// 执行主函数
main();
