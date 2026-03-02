'use strict';

var express = require('express');
var path = require('path');
var https = require('https');
var sqlite3 = require('sqlite3').verbose();

var app = express();
var PORT = 8080;

// 初始化SQLite数据库
var db = new sqlite3.Database('./data.db', function(err) {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
    // 创建数据表
    db.run(`CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, function(err) {
      if (err) {
        console.error('创建表失败:', err);
      } else {
        console.log('数据表创建成功');
      }
    });
  }
});

app.use(express.json());

var allData = { prices: [], dates: [] };
var sp500Data = { prices: [], dates: [] };
var lastUpdate = null;

function fetchFromStooq(symbol) {
  return new Promise(function(resolve, reject) {
    console.log('正在从Stooq获取' + symbol + '数据...');
    
    var options = {
      hostname: 'stooq.com',
      path: '/q/d/l/?s=' + encodeURIComponent(symbol) + '&i=d',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    };
    
    var req = https.request(options, function(response) {
      var data = '';
      response.on('data', function(chunk) {
        data += chunk;
      });
      response.on('end', function() {
        try {
          console.log('Stooq API返回状态码:', response.statusCode);
          if (response.statusCode !== 200) {
            console.error('Stooq API返回状态码:', response.statusCode);
            resolve(null);
            return;
          }
          
          console.log('Stooq返回数据长度:', data.length);
          console.log('Stooq返回数据前200字符:', data.substring(0, 200));
          
          var lines = data.split('\n');
          console.log('Stooq数据行数:', lines.length);
          
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
            console.log('成功从Stooq获取' + symbol + '数据，共' + prices.length + '条记录');
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
    
    req.on('timeout', function() {
      console.error('获取Stooq数据超时');
      req.destroy();
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

function getDataByYears(data, years) {
  var today = new Date();
  var startDate = new Date(today);
  startDate.setFullYear(startDate.getFullYear() - years);
  var startStr = startDate.toISOString().split('T')[0];
  
  var startIndex = 0;
  for (var i = 0; i < data.dates.length; i++) {
    if (data.dates[i] >= startStr) {
      startIndex = i;
      break;
    }
  }
  
  return {
    prices: data.prices.slice(startIndex),
    dates: data.dates.slice(startIndex)
  };
}

function updateData() {
  console.log('[' + new Date().toLocaleString() + '] 正在更新指数数据...');

  Promise.all([
    fetchFromStooq('^ndx'),
    fetchFromStooq('^spx')
  ]).then(function(results) {
    var ndxData = results[0];
    var spxData = results[1];
    
    if (!ndxData || ndxData.prices.length === 0) {
      console.log('纳斯达克100获取失败，使用模拟数据');
      ndxData = generateRealisticData(18500, 0.015, 7300);
    }
    
    if (!spxData || spxData.prices.length === 0) {
      console.log('标普500获取失败，使用模拟数据');
      spxData = generateRealisticData(4200, 0.012, 7300);
    }
    
    allData = ndxData;
    sp500Data = spxData;
    lastUpdate = new Date();
    console.log('数据更新完成！纳斯达克100共' + allData.prices.length + '条记录，标普500共' + sp500Data.prices.length + '条记录');
  }).catch(function(error) {
    console.error('更新数据失败:', error);
    
    allData = generateRealisticData(18500, 0.015, 7300);
    sp500Data = generateRealisticData(4200, 0.012, 7300);
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
  var symbol = req.query.symbol || 'ndx';
  
  // 对比模式：同时返回两个指数的数据
  if (symbol === 'compare') {
    var ndxData = getDataByYears(allData, years);
    var spxData = getDataByYears(sp500Data, years);
    
    // 计算归一化数据（以第一个数据点为基准）
    var ndxNormalized = normalizeData(ndxData.prices);
    var spxNormalized = normalizeData(spxData.prices);
    
    // 计算两个指数的回撤指标
    var ndxCurrentDD = calculateCurrentDrawdown(ndxData.prices, ndxData.dates);
    var ndxMaxDD = calculateMaxDrawdown(ndxData.prices, ndxData.dates);
    var spxCurrentDD = calculateCurrentDrawdown(spxData.prices, spxData.dates);
    var spxMaxDD = calculateMaxDrawdown(spxData.prices, spxData.dates);
    
    res.json({
      compare: {
        ndx: {
          name: '纳斯达克100指数',
          symbol: 'ndx',
          data: ndxData.prices,
          dates: ndxData.dates,
          normalized: ndxNormalized,
          current_drawdown: ndxCurrentDD.drawdown,
          peak: ndxCurrentDD.peak,
          peak_date: ndxCurrentDD.peakDate,
          peak_index: ndxCurrentDD.peakIndex,
          formation_days: ndxCurrentDD.formationDays,
          max_drawdown: ndxMaxDD.maxDrawdown,
          max_value: ndxMaxDD.maxValue,
          min_value: ndxMaxDD.minValue,
          max_date: ndxMaxDD.maxDate,
          min_date: ndxMaxDD.minDate,
          max_index: ndxMaxDD.maxIndex,
          min_index: ndxMaxDD.minIndex,
          max_formation_days: ndxMaxDD.formationDays,
          recovery_days: ndxMaxDD.recoveryDays
        },
        spx: {
          name: '标普500指数',
          symbol: 'spx',
          data: spxData.prices,
          dates: spxData.dates,
          normalized: spxNormalized,
          current_drawdown: spxCurrentDD.drawdown,
          peak: spxCurrentDD.peak,
          peak_date: spxCurrentDD.peakDate,
          peak_index: spxCurrentDD.peakIndex,
          formation_days: spxCurrentDD.formationDays,
          max_drawdown: spxMaxDD.maxDrawdown,
          max_value: spxMaxDD.maxValue,
          min_value: spxMaxDD.minValue,
          max_date: spxMaxDD.maxDate,
          min_date: spxMaxDD.minDate,
          max_index: spxMaxDD.maxIndex,
          min_index: spxMaxDD.minIndex,
          max_formation_days: spxMaxDD.formationDays,
          recovery_days: spxMaxDD.recoveryDays
        }
      },
      last_update: lastUpdate ? lastUpdate.toLocaleString() : null
    });
    return;
  }
  
  var data;
  var name;
  if (symbol === 'spx') {
    data = getDataByYears(sp500Data, years);
    name = '标普500指数';
  } else {
    data = getDataByYears(allData, years);
    name = '纳斯达克100指数';
  }
  
  var currentDD = calculateCurrentDrawdown(data.prices, data.dates);
  var maxDD = calculateMaxDrawdown(data.prices, data.dates);
  
  res.json({
    index: {
      name: name,
      symbol: symbol,
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

// 归一化数据函数
function normalizeData(prices) {
  if (!prices || prices.length === 0) return [];
  var base = prices[0];
  return prices.map(function(price) {
    return (price / base * 100).toFixed(2);
  });
}

app.get('/api/refresh', function(req, res) {
  updateData();
  res.json({ status: 'ok', message: '数据已刷新' });
});

// 添加数据记录API
app.post('/api/records', function(req, res) {
  var date = req.body.date;
  var value = parseFloat(req.body.value);
  
  if (!date || isNaN(value)) {
    res.status(400).json({ status: 'error', message: '日期和数值不能为空' });
    return;
  }
  
  db.run('INSERT INTO records (date, value) VALUES (?, ?)', [date, value], function(err) {
    if (err) {
      console.error('插入数据失败:', err);
      res.status(500).json({ status: 'error', message: '保存失败' });
    } else {
      res.json({ status: 'ok', message: '保存成功', id: this.lastID });
    }
  });
});

// 获取所有记录API
app.get('/api/records', function(req, res) {
  db.all('SELECT * FROM records ORDER BY date DESC', function(err, rows) {
    if (err) {
      console.error('查询数据失败:', err);
      res.status(500).json({ status: 'error', message: '查询失败' });
    } else {
      res.json({ status: 'ok', data: rows });
    }
  });
});

// 删除记录API
app.delete('/api/records/:id', function(req, res) {
  var id = req.params.id;
  db.run('DELETE FROM records WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('删除数据失败:', err);
      res.status(500).json({ status: 'error', message: '删除失败' });
    } else {
      res.json({ status: 'ok', message: '删除成功' });
    }
  });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('==========================================');
  console.log('智能创作系统');
  console.log('==========================================');
  console.log('服务器启动在 http://0.0.0.0:' + PORT);
  console.log('API接口: http://localhost:' + PORT + '/api/indexes');
  console.log('手动刷新: http://localhost:' + PORT + '/api/refresh');
  console.log('==========================================');
});
