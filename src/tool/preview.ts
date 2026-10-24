// 截图与预览用的示例数据（不会进入正式运行）。商品均为虚构。
export const rows = () => [];
export const params = {};
export const isPreview = () => typeof location !== 'undefined' && location.pathname.endsWith('preview.html');
export const PREVIEW_CSV = `商品名称,类目,售价,采购成本,月销量,评论数,评分
不锈钢保温杯 500毫升,家居,19.9,5.5,2400,320,4.7
硅胶折叠水壶,户外,15.5,6.2,900,80,4.3
桌面护眼小台灯,家居,24.0,9.0,5200,2100,4.6
运动护腕,运动,8.9,2.1,1800,45,4.1
便携挂脖风扇,小家电,22.0,17.5,3000,900,3.8
帆布收纳包,箱包,12.0,3.0,,,
快充数据线,配件,6.5,2.0,7600,5600,4.5
加厚瑜伽垫,运动,18.0,7.5,1500,150,4.4
香薰蜡烛,家居,9.9,3.2,2100,260,4.6`;
export const PREVIEW_SETTINGS = { commission: 8, ads: 10, returns: 3, shipping: 2, minMargin: 20 };
