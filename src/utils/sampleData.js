/**
 * 内置演示数据：模拟真实的“历史旧系统客户信息与扩展配置.xlsx”
 * 包含多 Sheet 页签、嵌套 JSON 字符串字段、脏数据等典型现实场景
 */

export const SAMPLE_SHEETS = {
  '客户主档案 (含JSON扩展)': {
    headers: [
      '客户编号',
      '客户姓名 (含空格)',
      '联系电话',
      '电子邮箱',
      '性别',
      '所属城市',
      '注册时间',
      '账户余额 (元)',
      '会员等级',
      '客户状态',
      '扩展属性 (多层JSON格式)'
    ],
    rows: [
      {
        '客户编号': 'CUST-001',
        '客户姓名 (含空格)': ' 张小凡 ',
        '联系电话': '138 0013 8000',
        '电子邮箱': 'zhang_xf@example.com',
        '性别': '男',
        '所属城市': '北京',
        '注册时间': '2021/04/15 10:30:00',
        '账户余额 (元)': '¥ 1,280.50',
        '会员等级': 'VIP金牌',
        '客户状态': '正常',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: '线上微信小程序', adCampaign: '2021春季推广' },
          profile: { address: { province: '北京市', city: '朝阳区', street: '建国路88号' }, hobbies: ['摄影', '骑行'] },
          metrics: { loyaltyScore: 95, orderCount: 38 }
        })
      },
      {
        '客户编号': 'CUST-002',
        '客户姓名 (含空格)': '李雪琪',
        '联系电话': '139-1234-5678',
        '电子邮箱': 'lxq_vip@company.cn',
        '性别': '女',
        '所属城市': '上海',
        '注册时间': '2021.06.22',
        '账户余额 (元)': '9,800.00元',
        '会员等级': 'VIP钻石',
        '客户状态': '启用',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: '线下旗舰店', adCampaign: '老带新推荐' },
          profile: { address: { province: '上海市', city: '黄浦区', street: '南京东路100号' }, hobbies: ['阅读', '茶艺'] },
          metrics: { loyaltyScore: 99, orderCount: 120 }
        })
      },
      {
        '客户编号': 'CUST-003',
        '客户姓名 (含空格)': '陆雪琪  ',
        '联系电话': '+86 13700001111',
        '电子邮箱': 'luxueqi@test.org',
        '性别': '女',
        '所属城市': '杭州',
        '注册时间': '2022-01-10 16:45',
        '账户余额 (元)': '350.8',
        '会员等级': '普通会员',
        '客户状态': '正常',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: '抖音官方直播间', adCampaign: '年中大促' },
          profile: { address: { province: '浙江省', city: '杭州市', street: '西湖区文三路88号' }, hobbies: ['徒步'] },
          metrics: { loyaltyScore: 78, orderCount: 6 }
        })
      },
      {
        '客户编号': 'CUST-004',
        '客户姓名 (含空格)': '林惊羽',
        '联系电话': '13611112222',
        '电子邮箱': 'linjy@domain.com',
        '性别': '男',
        '所属城市': '深圳',
        '注册时间': '2022年08月18日',
        '账户余额 (元)': '¥ 0.00',
        '会员等级': 'VIP银牌',
        '客户状态': '冻结',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: 'PC网页端', adCampaign: '搜索推广' },
          profile: { address: { province: '广东省', city: '深圳市', street: '南山区科技园' }, hobbies: ['游戏', '数码'] },
          metrics: { loyaltyScore: 82, orderCount: 15 }
        })
      },
      {
        '客户编号': 'CUST-005',
        '客户姓名 (含空格)': '碧瑶',
        '联系电话': '135-8888-9999',
        '电子邮箱': 'biyao_star@ghost.com',
        '性别': '女',
        '所属城市': '成都',
        '注册时间': '2023/02/01',
        '账户余额 (元)': '15,600',
        '会员等级': 'VIP钻石',
        '客户状态': '正常',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: '小红书种草', adCampaign: 'KOL合作' },
          profile: { address: { province: '四川省', city: '成都市', street: '锦江区春熙路' }, hobbies: ['美妆', '旅游'] },
          metrics: { loyaltyScore: 98, orderCount: 92 }
        })
      },
      {
        '客户编号': 'CUST-002', // 故意模拟重复记录
        '客户姓名 (含空格)': '李雪琪(重)',
        '联系电话': '139-1234-5678',
        '电子邮箱': 'lxq_vip@company.cn',
        '性别': '女',
        '所属城市': '上海',
        '注册时间': '2021.06.22',
        '账户余额 (元)': '9,800.00',
        '会员等级': 'VIP钻石',
        '客户状态': '启用',
        '扩展属性 (多层JSON格式)': JSON.stringify({
          source: { channel: '线下旗舰店', adCampaign: '老带新' },
          profile: { address: { province: '上海市', city: '黄浦区', street: '南京东路' } },
          metrics: { loyaltyScore: 99 }
        })
      }
    ]
  },
  '历史归档备份Sheet (多Tab演示)': {
    headers: ['归档编号', '历史客户名', '历史手机', '历史积分', '归档时间'],
    rows: [
      { '归档编号': 'OLD-901', '历史客户名': '张三丰', '历史手机': '13900009999', '历史积分': '890', '归档时间': '2019-12-31' },
      { '归档编号': 'OLD-902', '历史客户名': '风清扬', '历史手机': '13811112222', '历史积分': '1250', '归档时间': '2020-05-15' },
      { '归档编号': 'OLD-903', '历史客户名': '令狐冲', '历史手机': '13733334444', '历史积分': '360', '归档时间': '2020-11-20' }
    ]
  },
  'VIP专项高价值会员': {
    headers: ['VIP编号', '尊贵姓名', '专有客服经理', '年消费额', '专属通道'],
    rows: [
      { 'VIP编号': 'V-001', '尊贵姓名': '王老板', '专有客服经理': '陈经理', '年消费额': '180,000', '专属通道': '绿通A' },
      { 'VIP编号': 'V-002', '尊贵姓名': '赵总', '专有客服经理': '刘经理', '年消费额': '350,000', '专属通道': 'VIP黑金' }
    ]
  }
}

export const SAMPLE_SOURCE_HEADERS = SAMPLE_SHEETS['客户主档案 (含JSON扩展)'].headers
export const SAMPLE_SOURCE_ROWS = SAMPLE_SHEETS['客户主档案 (含JSON扩展)'].rows

/**
 * 目标数据库表结构定义（以标准的 MySQL/PostgreSQL 用户表为例）
 */
export const SAMPLE_TARGET_SCHEMA = {
  tableName: 't_user',
  tableComment: '用户中心基础信息表',
  fields: [
    {
      name: 'user_code',
      label: '用户编码',
      type: 'varchar',
      length: 64,
      nullable: false,
      isPrimary: true,
      defaultValue: '',
      comment: '唯一业务编号'
    },
    {
      name: 'username',
      label: '真实姓名',
      type: 'varchar',
      length: 50,
      nullable: false,
      isPrimary: false,
      defaultValue: '',
      comment: '用户姓名'
    },
    {
      name: 'mobile',
      label: '手机号',
      type: 'varchar',
      length: 20,
      nullable: false,
      isPrimary: false,
      defaultValue: '',
      comment: '标准11位手机号'
    },
    {
      name: 'email',
      label: '电子邮箱',
      type: 'varchar',
      length: 100,
      nullable: true,
      isPrimary: false,
      defaultValue: '',
      comment: '联系邮箱'
    },
    {
      name: 'gender',
      label: '性别代号',
      type: 'int',
      length: 4,
      nullable: false,
      isPrimary: false,
      defaultValue: '0',
      comment: '0:未知 1:男 2:女'
    },
    {
      name: 'channel',
      label: '来源渠道 (从JSON提取)',
      type: 'varchar',
      length: 64,
      nullable: true,
      isPrimary: false,
      defaultValue: '',
      comment: '从JSON深层 source.channel 提取'
    },
    {
      name: 'full_address',
      label: '详细地址 (JSON多层拼接)',
      type: 'varchar',
      length: 255,
      nullable: true,
      isPrimary: false,
      defaultValue: '',
      comment: '由省+市+街道拼接'
    },
    {
      name: 'vip_tag',
      label: '客户质量评级 (自定义JS规则)',
      type: 'varchar',
      length: 50,
      nullable: false,
      isPrimary: false,
      defaultValue: '普通客户',
      comment: '由自定义 JS 动态计算得出'
    },
    {
      name: 'balance',
      label: '账户余额',
      type: 'decimal',
      length: '12,2',
      nullable: false,
      isPrimary: false,
      defaultValue: '0.00',
      comment: '精确到分'
    },
    {
      name: 'registered_at',
      label: '注册时间',
      type: 'datetime',
      length: null,
      nullable: false,
      isPrimary: false,
      defaultValue: 'CURRENT_TIMESTAMP',
      comment: '标准格式'
    }
  ]
}

/**
 * 示例针对上述表的推荐字段清洗与映射配置（包含 JSON 提取与 JS 自定义清洗）
 */
export const SAMPLE_MAPPING_RULES = [
  {
    targetField: 'user_code',
    sourceField: '客户编号',
    sourceType: 'field',
    cleanRules: [
      { type: 'trim', enabled: true },
      { type: 'uppercase', enabled: true }
    ],
    defaultValue: ''
  },
  {
    targetField: 'username',
    sourceField: '客户姓名 (含空格)',
    sourceType: 'field',
    cleanRules: [
      { type: 'trim', enabled: true },
      { type: 'clean_whitespace', enabled: true }
    ],
    defaultValue: ''
  },
  {
    targetField: 'mobile',
    sourceField: '联系电话',
    sourceType: 'field',
    cleanRules: [
      { type: 'clean_phone', enabled: true }
    ],
    defaultValue: ''
  },
  {
    targetField: 'email',
    sourceField: '电子邮箱',
    sourceType: 'field',
    cleanRules: [
      { type: 'trim', enabled: true },
      { type: 'lowercase', enabled: true }
    ],
    defaultValue: ''
  },
  {
    targetField: 'gender',
    sourceField: '性别',
    sourceType: 'field',
    cleanRules: [
      {
        type: 'dict_mapping',
        enabled: true,
        mapping: {
          '男': 1,
          '女': 2,
          '未知': 0
        },
        fallbackValue: 0
      }
    ],
    defaultValue: 0
  },
  {
    targetField: 'channel',
    sourceField: '扩展属性 (多层JSON格式)',
    sourceType: 'json_path',
    jsonPath: 'source.channel',
    cleanRules: [
      { type: 'trim', enabled: true }
    ],
    defaultValue: '未知渠道'
  },
  {
    targetField: 'full_address',
    sourceField: '扩展属性 (多层JSON格式)',
    sourceType: 'json_path',
    combinePaths: ['profile.address.province', 'profile.address.city', 'profile.address.street'],
    jsonSeparator: ' ',
    cleanRules: [
      { type: 'trim', enabled: true }
    ],
    defaultValue: ''
  },
  {
    targetField: 'vip_tag',
    sourceField: '扩展属性 (多层JSON格式)',
    sourceType: 'custom_js',
    customJsCode: `// 自定义 JS 清洗逻辑：参数提供 row (整行), val (原始值), json (自动解析后的JSON对象)
const score = json?.metrics?.loyaltyScore || 0;
const balance = parseFloat(String(row['账户余额 (元)']).replace(/[^0-9.]/g, '')) || 0;

if (score >= 95 || balance > 5000) {
  return '🌟 超级SVIP会员';
} else if (score >= 80) {
  return '⭐ 重点活跃客户';
} else {
  return '普通价值客户';
}`,
    cleanRules: [],
    defaultValue: '普通客户'
  },
  {
    targetField: 'balance',
    sourceField: '账户余额 (元)',
    sourceType: 'field',
    cleanRules: [
      { type: 'extract_number', enabled: true, decimals: 2 }
    ],
    defaultValue: 0
  },
  {
    targetField: 'registered_at',
    sourceField: '注册时间',
    sourceType: 'field',
    cleanRules: [
      { type: 'standard_datetime', enabled: true, outputFormat: 'YYYY-MM-DD HH:mm:ss' }
    ],
    defaultValue: ''
  }
]
