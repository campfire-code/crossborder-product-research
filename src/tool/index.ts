// 工具声明：跨境选品报告（自定义界面；数据来自用户导入的商品表，可选用用户自己配置的大模型写解读）。
import { ClipboardList } from 'lucide-react';
import { createElement } from 'react';
import type { CustomTool } from '../kit/types';
import { Main } from './Main';

const tool: CustomTool = {
  id: 'e17',
  name: '跨境选品报告',
  tagline: '导入商品表，按利润、需求、竞争、口碑给每个商品打分排名，生成选品报告（可选大模型解读）。',
  icon: ClipboardList,
  category: '电商运营',
  type: 'data',
  mode: 'custom',
  mainLabel: '选品报告',
  needsLLM: true,
  params: [],
  Main: ({ ctx }) => createElement(Main, { ctx }),
};

export default tool;
