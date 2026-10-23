// 截图与预览用的示例数据（不会进入正式运行）。商品均为虚构的「示例」。
export const rows = () => [];
export const params = {};
export const isPreview = () => typeof location !== 'undefined' && location.pathname.endsWith('preview.html');
export const PREVIEW_CSV = `商品名称,类目,售价,采购成本,月销量,评论数,评分
示例保温杯 500ml,家居,19.9,5.5,2400,320,4.7
示例硅胶折叠水壶,户外,15.5,6.2,900,80,4.3
示例桌面小台灯,家居,24.0,9.0,5200,2100,4.6
示例运动护腕,运动,8.9,2.1,1800,45,4.1
示例便携挂脖风扇,小家电,22.0,17.5,3000,900,3.8
示例帆布收纳包,箱包,12.0,3.0,,,
示例快充数据线,配件,6.5,2.0,7600,5600,4.5
示例瑜伽垫,运动,18.0,7.5,1500,150,4.4
示例香薰蜡烛,家居,9.9,3.2,2100,260,4.6`;
export const PREVIEW_SETTINGS = { commission: 8, ads: 10, returns: 3, shipping: 2, minMargin: 20 };
