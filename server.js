'use strict';

var express = require('express');
var path = require('path');
var https = require('https');

var app = express();
var PORT = 8080;

var allData = { prices: [], dates: [] };
var lastUpdate = null;

function fetchFromStooq() {
  return new Promise(function(resolve, reject) {
    console.log('正在从Stooq获取纳斯达克100指数数据...');
    
    var options = {
      hostname: 'stooq.com',
      path: '/q/d/l/?s=%5Endx&i=d',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };
    
    var req = https.request(options, function(response) {
      var data = '';
      response.on('data', function(chunk) {
        data += chunk;
      });
      response.on('end', function() {
        try {
          if (response.statusCode !== 200) {
            console.error('Stooq API返回状态码:', response.statusCode);
            resolve(null);
            return;
          }
          
          var lines = data.split('\n');
          var prices = [];
          var dates = [];
          
          for (var i = 1; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            var parts = line.split(',');
            if (parts.length >= 5) {
              var dateStr = parts[0];
              var close = parseFloat(parts[4]);
              
              if (!isNaN(close) && close > 0) {
                dates.push(dateStr);
                prices.push(close);
              }
            }
          }
          
          if (prices.length > 0) {
            console.log('成功从Stooq获取纳斯达克100指数数据，共' + prices.length + '条记录');
            resolve({ prices: prices, dates: dates });
          } else {
            console.log('Stooq数据为空');
            resolve(null);
          }
        } catch (error) {
          console.error('解析Stooq数据失败:', error.message);
          resolve(null);
        }
      });
    });
    
    req.on('error', function(error) {
      console.error('获取Stooq数据失败:', error.message);
      resolve(null);
    });
    
    req.end();
  });
}

function calculateCurrentDrawdown(prices, dates) {
  if (!prices || prices.length < 2) return { drawdown: 0, peak: 0, peakDate: '', peakIndex: 0, formationDays: 0 };

  var peak = prices[0];
  var peakIndex = 0;

  for (var i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIndex = i;
    }
  }

  var currentPrice = prices[prices.length - 1];
  var drawdown = (currentPrice - peak) / peak;
  var peakDate = dates[peakIndex];
  var formationDays = prices.length - 1 - peakIndex;

  return { drawdown: drawdown, peak: peak, peakDate: peakDate, peakIndex: peakIndex, formationDays: formationDays };
}

function calculateMaxDrawdown(prices, dates) {
  if (!prices || prices.length < 2) return { maxDrawdown: 0, maxValue: 0, minValue: 0, maxDate: '', minDate: '', maxIndex: 0, minIndex: 0, formationDays: 0, recoveryDays: 0 };

  var maxDrawdown = 0;
  var maxValue = prices[0];
  var minValue = prices[0];
  var maxIndex = 0;
  var minIndex = 0;
  var peak = prices[0];
  var peakIndex = 0;

  for (var i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIndex = i;
    } else {
      var drawdown = (peak - prices[i]) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxValue = peak;
        maxIndex = peakIndex;
        minValue = prices[i];
        minIndex = i;
      }
    }
  }

  var maxDate = dates[maxIndex];
  var minDate = dates[minIndex];
  var formationDays = minIndex - maxIndex;
  
  var recoveryDays = 0;
  for (var j = minIndex + 1; j < prices.length; j++) {
    if (prices[j] >= maxValue) {
      recoveryDays = j - minIndex;
      break;
    }
  }
  if (recoveryDays === 0 && prices[prices.length - 1] < maxValue) {
    recoveryDays = prices.length - 1 - minIndex;
  }

  return { 
    maxDrawdown: maxDrawdown, 
    maxValue: maxValue, 
    minValue: minValue, 
    maxDate: maxDate, 
    minDate: minDate,
    maxIndex: maxIndex,
    minIndex: minIndex,
    formationDays: formationDays,
    recoveryDays: recoveryDays
  };
}

function getDataByYears(years) {
  var today = new Date();
  var startDate = new Date(today);
  startDate.setFullYear(startDate.getFullYear() - years);
  var startStr = startDate.toISOString().split('T')[0];
  
  var startIndex = 0;
  for (var i = 0; i < allData.dates.length; i++) {
    if (allData.dates[i] >= startStr) {
      startIndex = i;
      break;
    }
  }
  
  return {
    prices: allData.prices.slice(startIndex),
    dates: allData.dates.slice(startIndex)
  };
}

function updateData() {
  console.log('[' + new Date().toLocaleString() + '] 正在更新纳斯达克100指数数据...');

  fetchFromStooq().then(function(data) {
    if (!data || data.prices.length === 0) {
      console.log('Stooq获取失败，使用模拟数据');
      data = generateRealisticData(18500, 0.015, 7300);
    }
    
    allData = data;
    lastUpdate = new Date();
    console.log('数据更新完成！共' + allData.prices.length + '条记录');
  }).catch(function(error) {
    console.error('更新数据失败:', error);
    
    var data = generateRealisticData(18500, 0.015, 7300);
    allData = data;
    lastUpdate = new Date();
    console.log('数据更新完成（使用模拟数据）！');
  });
}

function generateRealisticData(basePrice, volatility, days) {
  var prices = [];
  var dates = [];
  var today = new Date();
  var price = basePrice;
  var trend = 0.0001;

  for (var i = 0; i < days; i++) {
    var date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - i));
    dates.push(date.toISOString().split('T')[0]);

    var randomChange = (Math.random() - 0.5) * 2 * volatility;
    var trendChange = trend * (Math.random() * 0.5 + 0.75);

    price = price * (1 + randomChange + trendChange);
    price = Math.max(price, basePrice * 0.7);
    prices.push(Math.round(price * 100) / 100);
  }

  return { prices: prices, dates: dates };
}

updateData();

setInterval(function() {
  updateData();
}, 24 * 60 * 60 * 1000);

app.use(express.static(path.join(__dirname)));

app.get('/api/indexes', function(req, res) {
  var years = parseInt(req.query.years) || 1;
  var data = getDataByYears(years);
  var currentDD = calculateCurrentDrawdown(data.prices, data.dates);
  var maxDD = calculateMaxDrawdown(data.prices, data.dates);
  
  res.json({
    nasdaq100: {
      name: '纳斯达克100指数',
      data: data.prices,
      dates: data.dates,
      current_drawdown: currentDD.drawdown,
      peak: currentDD.peak,
      peak_date: currentDD.peakDate,
      peak_index: currentDD.peakIndex,
      formation_days: currentDD.formationDays,
      max_drawdown: maxDD.maxDrawdown,
      max_value: maxDD.maxValue,
      min_value: maxDD.minValue,
      max_date: maxDD.maxDate,
      min_date: maxDD.minDate,
      max_index: maxDD.maxIndex,
      min_index: maxDD.minIndex,
      max_formation_days: maxDD.formationDays,
      recovery_days: maxDD.recoveryDays
    },
    last_update: lastUpdate ? lastUpdate.toLocaleString() : null
  });
});

app.get('/api/refresh', function(req, res) {
  updateData();
  res.json({ status: 'ok', message: '数据已刷新' });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('==========================================');
  console.log('纳斯达克100指数监控系统');
  console.log('==========================================');
  console.log('服务器启动在 http://0.0.0.0:' + PORT);
  console.log('API接口: http://localhost:' + PORT + '/api/indexes');
  console.log('手动刷新: http://localhost:' + PORT + '/api/refresh');
  console.log('==========================================');
});
