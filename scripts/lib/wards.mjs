// 札幌市10区。code は全国地方公共団体コード(N03_007)。id はエンティティ ID と URL に使う綴り。
export const WARDS = Object.freeze([
  { code: '01101', id: 'chuo', name: '中央区' },
  { code: '01102', id: 'kita', name: '北区' },
  { code: '01103', id: 'higashi', name: '東区' },
  { code: '01104', id: 'shiroishi', name: '白石区' },
  { code: '01105', id: 'toyohira', name: '豊平区' },
  { code: '01106', id: 'minami', name: '南区' },
  { code: '01107', id: 'nishi', name: '西区' },
  { code: '01108', id: 'atsubetsu', name: '厚別区' },
  { code: '01109', id: 'teine', name: '手稲区' },
  { code: '01110', id: 'kiyota', name: '清田区' },
]);

export const wardById = (id) => {
  const w = WARDS.find((x) => x.id === id);
  if (!w) throw new Error(`未知の区 ID: ${id}`);
  return w;
};
