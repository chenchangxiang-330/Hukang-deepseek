/**
 * 条形码归一化单元测试（测试策略第一层：Mac 本地）
 *
 * 守的是：校验位必须真算、UPC-E 必须先展开再查、同一个码的多种写法都要能查。
 * 测试数据用真实存在的公开条码，校验位均已按 GTIN 标准核对。
 */

import {
  computeCheckDigit,
  expandUpceToUpca,
  isValidGtin,
  normalizeBarcode,
} from '../barcode';

describe('computeCheckDigit —— GTIN 标准校验位', () => {
  it('EAN-13（12 位载荷）', () => {
    expect(computeCheckDigit('690123456789')).toBe(2);
    expect(computeCheckDigit('544900000099')).toBe(6);
    expect(computeCheckDigit('301762042200')).toBe(3);
  });

  it('EAN-8（7 位载荷）', () => {
    expect(computeCheckDigit('9638507')).toBe(4);
  });

  it('UPC-A（11 位载荷）', () => {
    expect(computeCheckDigit('03600029145')).toBe(2);
  });
});

describe('isValidGtin', () => {
  it('接受校验位正确的码', () => {
    expect(isValidGtin('6901234567892')).toBe(true);
    expect(isValidGtin('5449000000996')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
  });

  it('拒绝校验位错误的码（不放过“看起来像”的输入）', () => {
    // 需求文档 §18 举例用的 6901234567890 校验位是错的，必须被识别出来
    expect(isValidGtin('6901234567890')).toBe(false);
    expect(isValidGtin('6901234567891')).toBe(false);
  });

  it('拒绝非数字', () => {
    expect(isValidGtin('69012abc5678')).toBe(false);
    expect(isValidGtin('')).toBe(false);
  });
});

describe('expandUpceToUpca —— UPC-E 压缩码展开', () => {
  it('末位为 5-9 时补 4 个 0', () => {
    expect(expandUpceToUpca('01234565')).toBe('012345000065');
  });

  it('末位为 0/1/2 时按第三位补 4 个 0', () => {
    // upce=0 123430 5 → N=0, S1..S6=123430, S6=0 → 12 0 0000 343
    expect(expandUpceToUpca('01234305')).toBe('012000003435');
    // upce=0 421000 5 → N=0, S1..S6=421000, S6=0 → 42 0 0000 100
    expect(expandUpceToUpca('04210005')).toBe('042000001005');
  });

  it('末位为 3 时补 5 个 0', () => {
    // upce=0 123453 0 → S6=3 → 123 00000 45
    expect(expandUpceToUpca('01234530')).toBe('012300000450');
  });

  it('末位为 4 时补 5 个 0（位置不同）', () => {
    // upce=0 123454 0 → S6=4 → 1234 00000 5
    expect(expandUpceToUpca('01234540')).toBe('012340000050');
  });

  it('非 0/1 开头的 8 位码不是 UPC-E', () => {
    expect(expandUpceToUpca('21234565')).toBeNull();
    expect(expandUpceToUpca('1234565')).toBeNull();
  });
});

describe('normalizeBarcode —— 归一化与查询键', () => {
  it('EAN-13 直接作为查询键', () => {
    const r = normalizeBarcode('6901234567892');
    expect(r.format).toBe('EAN13');
    expect(r.valid).toBe(true);
    expect(r.ean13).toBe('6901234567892');
    expect(r.lookupKeys).toEqual(['6901234567892']);
  });

  it('会清掉空格与连字符', () => {
    const r = normalizeBarcode(' 690-1234 567892 ');
    expect(r.digits).toBe('6901234567892');
    expect(r.valid).toBe(true);
  });

  it('UPC-A 同时给出原始形式与补零的 EAN-13 形式', () => {
    const r = normalizeBarcode('036000291452');
    expect(r.format).toBe('UPCA');
    expect(r.valid).toBe(true);
    expect(r.ean13).toBe('0036000291452');
    // 两种写法都要试，不能只试一种就断言查不到
    expect(r.lookupKeys).toEqual(['036000291452', '0036000291452']);
  });

  it('UPC-E 必须先展开成 UPC-A / EAN-13 再查', () => {
    const r = normalizeBarcode('01234565', 'upc_e');
    expect(r.format).toBe('UPCE');
    expect(r.valid).toBe(true);
    expect(r.ean13).toBe('0012345000065');
    expect(r.lookupKeys).toContain('0012345000065');
    expect(r.lookupKeys).toContain('012345000065');
  });

  it('8 位且以 0 开头时按 UPC-E 尝试展开', () => {
    const r = normalizeBarcode('01234565');
    expect(r.format).toBe('UPCE');
    expect(r.valid).toBe(true);
  });

  it('普通 EAN-8 不会被误判成 UPC-E', () => {
    const r = normalizeBarcode('96385074', 'ean8');
    expect(r.format).toBe('EAN8');
    expect(r.valid).toBe(true);
    expect(r.lookupKeys).toEqual(['96385074']);
  });

  it('扫描器提示类型优先于长度推断', () => {
    // 同为 8 位，提示 upc_a 缺失时按长度推断；提示 ean8 时就是 ean8
    expect(normalizeBarcode('96385074', 'ean8').format).toBe('EAN8');
  });

  it('校验位错误时 valid=false，但仍然给出查询键供上层决定', () => {
    const r = normalizeBarcode('6901234567890');
    expect(r.valid).toBe(false);
    expect(r.reason).toBeTruthy();
    expect(r.lookupKeys).toEqual(['6901234567890']);
  });

  it('空输入不崩溃', () => {
    const r = normalizeBarcode('');
    expect(r.valid).toBe(false);
    expect(r.format).toBe('UNKNOWN');
    expect(r.lookupKeys).toEqual([]);
  });

  it('未知长度不冒充已知格式', () => {
    const r = normalizeBarcode('12345');
    expect(r.format).toBe('UNKNOWN');
    expect(r.valid).toBe(false);
  });

  it('GTIN-14 会剥掉前导 0 还原 EAN-13', () => {
    const r = normalizeBarcode('06901234567892');
    expect(r.format).toBe('GTIN14');
    expect(r.valid).toBe(true);
    expect(r.lookupKeys).toContain('6901234567892');
  });
});
