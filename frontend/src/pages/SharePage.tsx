import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Share2, ImageIcon, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { expenses as expensesApi, categories as categoriesApi } from '../lib/api'
import type { AIExpenseResponse, AIParseResponse, CategoryResponse, WalletResponse } from '../lib/types'
import { useWallet } from '../contexts/WalletContext'
import { useToast } from '../components/ui/Toast'
import { fmt, fmtDate } from '../lib/utils'
import { getAndClearSharedPayload } from '../lib/shareTarget'
import type { SharedPayload } from '../lib/shareTarget'

interface EditableExpense extends AIExpenseResponse {
  _editAmount: string
  _editCategory: string
  _editDescription: string
  _editTags: string
  _editDate: string
}

function toEditable(exp: AIExpenseResponse): EditableExpense {
  return {
    ...exp,
    _editAmount: exp.amount != null ? String(exp.amount) : '',
    _editCategory: exp.category_name ?? '',
    _editDescription: exp.description ?? '',
    _editTags: exp.suggested_tags.map((t) => t.name).join(', '),
    _editDate: exp.date ? exp.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  }
}

function commitEditable(e: EditableExpense): AIExpenseResponse {
  const parsed = parseFloat(e._editAmount)
  const tags = e._editTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name, is_new: !e.suggested_tags.find((t) => t.name === name) }))
  return {
    ...e,
    amount: isNaN(parsed) ? e.amount : parsed,
    category_name: e._editCategory.trim() || e.category_name,
    description: e._editDescription.trim() || null,
    date: e._editDate || e.date,
    suggested_tags: tags,
  }
}

type Stage = 'loading' | 'empty' | 'preview' | 'parsing' | 'review' | 'saving' | 'done'

export function SharePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const { wallets, activeWallet, setActiveWallet } = useWallet()

  const [stage, setStage] = useState<Stage>('loading')
  const [payload, setPayload] = useState<SharedPayload | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletResponse | null>(null)
  const [parseResult, setParseResult] = useState<AIParseResponse | null>(null)
  const [expenses, setExpenses] = useState<EditableExpense[]>([])
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [error, setError] = useState('')
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    getAndClearSharedPayload().then((data) => {
      if (!data) { setStage('empty'); return }
      setPayload(data)
      const img = data.files.find((f) => f.type.startsWith('image/'))
      if (img) {
        const url = URL.createObjectURL(img)
        objectUrlRef.current = url
        setImagePreview(url)
      }
      setStage('preview')
    }).catch(() => setStage('empty'))
  }, [])

  useEffect(() => {
    setSelectedWallet(activeWallet)
  }, [activeWallet])

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => {})
  }, [])

  const handleParse = useCallback(async () => {
    if (!payload || !selectedWallet) return
    setStage('parsing')
    setError('')
    try {
      const file = payload.files[0] ?? undefined
      const text = [payload.title, payload.text].filter(Boolean).join('\n') || undefined
      const result = await expensesApi.aiParse(selectedWallet.id, text, file)
      setParseResult(result)
      if (result.result_type === 'single') {
        setExpenses([toEditable(result.expenses[0])])
      } else if (result.result_type === 'multiple' || result.result_type === 'group') {
        setExpenses(result.expenses.map(toEditable))
      } else {
        setExpenses([])
      }
      setStage('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('share.parseError'))
      setStage('preview')
    }
  }, [payload, selectedWallet, t])

  const handleSave = async () => {
    if (!selectedWallet || expenses.length === 0) return
    setStage('saving')
    try {
      const committed = expenses.map(commitEditable)
      await Promise.all(
        committed.map((exp) =>
          expensesApi.create(selectedWallet.id, {
            category_name: exp.category_name ?? 'Others',
            category_icon: exp.suggested_icon ?? undefined,
            amount: exp.amount ?? 0,
            type: exp.type,
            description: exp.description ?? undefined,
            date: exp.date ?? undefined,
            tag_names: exp.suggested_tags.map((t) => t.name),
            ai_context: exp.ai_context ?? undefined,
          }),
        ),
      )
      toast(
        expenses.length === 1
          ? t('share.savedOne')
          : t('share.savedMany', { count: expenses.length }),
        'success',
      )
      setStage('done')
      setTimeout(() => navigate(activeWallet ? `/wallets/${activeWallet.id}` : '/'), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('share.saveError'))
      setStage('review')
    }
  }

  const handleWalletChange = (id: string) => {
    const w = wallets.find((w) => w.id === id) ?? null
    setSelectedWallet(w)
    if (w) setActiveWallet(w)
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Share2 size={20} style={{ color: 'var(--forest)' }} />
        <h1 style={{ fontSize: 18, fontFamily: 'var(--font-display)', margin: 0 }}>
          {t('share.title')}
        </h1>
      </div>

      {stage === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--forest)' }} />
        </div>
      )}

      {stage === 'empty' && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
          <Share2 size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>{t('share.noContent')}</p>
          <button
            onClick={() => navigate('/')}
            style={{ marginTop: 16, fontSize: 14, color: 'var(--forest)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {t('share.goHome')}
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <CheckCircle size={40} style={{ color: 'var(--forest)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, color: 'var(--ink)' }}>{t('share.saved')}</p>
        </div>
      )}

      {(stage === 'preview' || stage === 'parsing' || stage === 'review' || stage === 'saving') && payload && (
        <>
          {/* Shared content preview */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            {imagePreview ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <img
                  src={imagePreview}
                  alt=""
                  style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ImageIcon size={13} style={{ color: 'var(--ink-faint)' }} />
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {payload.files[0]?.name ?? t('share.image')}
                    </span>
                  </div>
                  {payload.text && (
                    <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, wordBreak: 'break-word' }}>
                      {payload.text}
                    </p>
                  )}
                </div>
              </div>
            ) : payload.text ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <FileText size={16} style={{ color: 'var(--ink-faint)', marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, wordBreak: 'break-word' }}>
                  {payload.text}
                </p>
              </div>
            ) : null}
          </div>

          {/* Wallet selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-faint)', marginBottom: 6 }}>
              {t('share.wallet')}
            </label>
            <select
              value={selectedWallet?.id ?? ''}
              onChange={(e) => handleWalletChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
                fontSize: 14,
                color: 'var(--ink)',
              }}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'color-mix(in oklch, var(--rose) 12%, transparent)', borderRadius: 8, marginBottom: 16 }}>
              <AlertCircle size={14} style={{ color: 'var(--rose)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--rose)' }}>{error}</span>
            </div>
          )}

          {/* Parse button */}
          {(stage === 'preview') && (
            <button
              onClick={handleParse}
              disabled={!selectedWallet}
              style={{
                width: '100%',
                padding: '11px',
                background: 'var(--forest)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: selectedWallet ? 'pointer' : 'not-allowed',
                opacity: selectedWallet ? 1 : 0.5,
              }}
            >
              {t('share.parseButton')}
            </button>
          )}

          {stage === 'parsing' && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24, color: 'var(--ink-faint)', fontSize: 14 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              {t('share.parsing')}
            </div>
          )}

          {/* Review */}
          {(stage === 'review' || stage === 'saving') && expenses.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
                {expenses.length === 1 ? t('share.reviewOne') : t('share.reviewMany', { count: expenses.length })}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {expenses.map((exp, i) => (
                  <ExpenseCard
                    key={i}
                    expense={exp}
                    categories={categories}
                    currency={selectedWallet?.currency ?? 'USD'}
                    onChange={(updated) => setExpenses((prev) => prev.map((e, j) => j === i ? updated : e))}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStage('preview')}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: 'transparent',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={stage === 'saving'}
                  style={{
                    flex: 2,
                    padding: '11px',
                    background: 'var(--forest)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: stage === 'saving' ? 'not-allowed' : 'pointer',
                    opacity: stage === 'saving' ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {stage === 'saving' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  {t('common.save')}
                </button>
              </div>
            </div>
          )}

          {(stage === 'review' || stage === 'saving') && parseResult?.result_type === 'recurring' && (
            <div style={{ padding: '12px 14px', background: 'color-mix(in oklch, var(--amber) 12%, transparent)', borderRadius: 8, fontSize: 13, color: 'var(--ink)' }}>
              {t('share.recurringUnsupported')}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface ExpenseCardProps {
  expense: EditableExpense
  categories: CategoryResponse[]
  currency: string
  onChange: (e: EditableExpense) => void
}

function ExpenseCard({ expense: exp, currency, onChange }: ExpenseCardProps) {
  const { t } = useTranslation()

  const field = (
    label: string,
    value: string,
    key: keyof EditableExpense,
    type: 'text' | 'number' | 'date' = 'text',
  ) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange({ ...exp, [key]: e.target.value })}
        style={{
          width: '100%',
          padding: '7px 9px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
          background: 'var(--surface)',
          color: 'var(--ink)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3 }}>
            {t('share.fieldType')}
          </label>
          <select
            value={exp.type}
            onChange={(e) => onChange({ ...exp, type: e.target.value as 'expense' | 'income' })}
            style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}
          >
            <option value="expense">{t('share.typeExpense')}</option>
            <option value="income">{t('share.typeIncome')}</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3 }}>
            {t('share.fieldAmount')} ({currency})
          </label>
          <input
            type="number"
            value={exp._editAmount}
            onChange={(e) => onChange({ ...exp, _editAmount: e.target.value })}
            style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      {field(t('share.fieldCategory'), exp._editCategory, '_editCategory')}
      {field(t('share.fieldDescription'), exp._editDescription, '_editDescription')}
      {field(t('share.fieldDate'), exp._editDate, '_editDate', 'date')}
      {field(t('share.fieldTags'), exp._editTags, '_editTags')}
      {exp.amount != null && (
        <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '4px 0 0' }}>
          {fmt(parseFloat(exp._editAmount) || (exp.amount ?? 0), currency)} · {fmtDate(exp._editDate)}
        </p>
      )}
    </div>
  )
}
