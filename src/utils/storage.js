import { SAMPLE_MAPPING_RULES, SAMPLE_TARGET_SCHEMA } from './sampleData'

const STORAGE_KEY = 'data_tools_saved_templates_v1'

export function getSavedTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // 初始化内置模板
      const initial = [
        {
          id: 'tpl_preset_user',
          name: '内置示例：老客户信息表 -> 现代用户中心表 (t_user)',
          description: '含姓名清洗、手机号格式化、性别字典映射、金额提取、日期规整',
          updatedAt: new Date().toISOString(),
          targetSchema: SAMPLE_TARGET_SCHEMA,
          mappingRules: SAMPLE_MAPPING_RULES,
          options: {
            dedupField: 'user_code',
            dedupStrategy: 'keep_first',
            skipEmptyRows: true,
            requiredFields: ['user_code', 'username', 'mobile']
          }
        }
      ]
      saveTemplatesList(initial)
      return initial
    }
    return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to parse templates from localStorage', e)
    return []
  }
}

export function saveTemplate(name, { targetSchema, mappingRules, options = {}, description = '' }) {
  const templates = getSavedTemplates()
  const existingIdx = templates.findIndex(t => t.name === name)

  const templateItem = {
    id: existingIdx !== -1 ? templates[existingIdx].id : 'tpl_' + Date.now(),
    name,
    description,
    updatedAt: new Date().toISOString(),
    targetSchema,
    mappingRules,
    options
  }

  if (existingIdx !== -1) {
    templates[existingIdx] = templateItem
  } else {
    templates.unshift(templateItem)
  }

  saveTemplatesList(templates)
  return templateItem
}

export function deleteTemplate(id) {
  const templates = getSavedTemplates().filter(t => t.id !== id)
  saveTemplatesList(templates)
  return templates
}

function saveTemplatesList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}
