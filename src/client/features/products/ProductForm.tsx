import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Archive, ArchiveRestore, Camera, ImagePlus, ImageUp, Plus } from 'lucide-react';

import { FormAlert, SelectField, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiClientError, apiPatch, apiPost, apiUpload } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { IMAGE_ACCEPT, prepareProductPhoto } from '@/lib/image';
import { centsToInput, parseAmountToCents } from '@shared/money';
import type { CategoryDto } from '@shared/schemas/categories';
import {
  createProductSchema,
  updateProductSchema,
  type ProductDto,
} from '@shared/schemas/products';

import { CameraCapture } from './photo/CameraCapture';
import { PhotoEditor } from './photo/PhotoEditor';

type Props = {
  /** The product to edit, or null to add a new one. */
  product: ProductDto | null;
  categories: CategoryDto[];
  onSaved: () => void;
};

type Values = {
  name: string;
  price: string;
  cost: string;
  sku: string;
  categoryId: string;
  trackStock: boolean;
  stock: string;
  lowStockThreshold: string;
};

function initialValues(p: ProductDto | null): Values {
  return {
    name: p?.name ?? '',
    price: p ? centsToInput(p.priceCents) : '',
    cost: p?.costCents != null ? centsToInput(p.costCents) : '',
    sku: p?.sku ?? '',
    categoryId: p?.categoryId ?? '',
    trackStock: p?.trackStock ?? true,
    stock: '',
    lowStockThreshold: String(p?.lowStockThreshold ?? 5),
  };
}

const wholeNumber = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

/** Add or edit a product (admins and the owner). Photos are compressed on the device. */
export function ProductForm({ product, categories: initialCategories, onSaved }: Props) {
  const editing = product !== null;
  const [values, setValues] = useState<Values>(() => initialValues(product));
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ full: Blob; thumb: Blob } | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Object URLs for local previews must be released.
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    const field = key === 'price' ? 'priceCents' : key === 'cost' ? 'costCents' : key;
    if (errors[field]) setErrors((errs) => withoutError(errs, field));
  }

  // Taking or picking a photo opens the camera or the editor; Done in the editor comes here.
  const [photoStep, setPhotoStep] = useState<
    { step: 'camera' } | { step: 'edit'; source: Blob } | null
  >(null);

  async function applyPhoto(edited: Blob) {
    setPhotoStep(null);
    setFormError(null);
    setBusy('Preparing photo…');
    try {
      const prepared = await prepareProductPhoto(edited);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared.full));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not use that photo.');
    } finally {
      setBusy(null);
    }
  }

  async function addCategory() {
    const name = newCategory?.trim();
    if (!name) return;
    try {
      const { category } = await apiPost<{ category: CategoryDto }>('/categories', { name });
      setCategories((list) => [...list, category]);
      set('categoryId', category.id);
      setNewCategory(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the category.');
    }
  }

  function payload(): { data: Record<string, unknown>; errors: FieldErrors } {
    const errs: FieldErrors = {};
    const priceCents = parseAmountToCents(values.price);
    if (priceCents === null) errs.priceCents = 'Enter a price like 120 or 120.50.';
    const costCents = values.cost.trim() === '' ? null : parseAmountToCents(values.cost);
    if (costCents === null && values.cost.trim() !== '') {
      errs.costCents = 'Enter a cost like 45 or 45.50, or leave it empty.';
    }
    const data: Record<string, unknown> = {
      name: values.name,
      priceCents,
      costCents,
      sku: values.sku,
      categoryId: values.categoryId || null,
      trackStock: values.trackStock,
      lowStockThreshold: wholeNumber(values.lowStockThreshold),
    };
    if (!editing && values.trackStock)
      data.stock = values.stock === '' ? 0 : wholeNumber(values.stock);
    return { data, errors: errs };
  }

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const built = payload();
    const checked = validate(editing ? updateProductSchema : createProductSchema, built.data);
    const allErrors = { ...(checked.errors ?? {}), ...built.errors };
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      focusFirstError(formRef.current, allErrors);
      return;
    }

    setBusy('Saving…');
    try {
      const saved = editing
        ? await apiPatch<{ product: ProductDto }>(`/products/${product.id}`, checked.data)
        : await apiPost<{ product: ProductDto }>('/products', checked.data);
      if (photo) {
        setBusy('Uploading photo…');
        await apiUpload(`/uploads/product?productId=${saved.product.id}`, photo.full);
        await apiUpload(`/uploads/product-thumb?productId=${saved.product.id}`, photo.thumb);
      }
      onSaved();
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      setErrors(apiErr.fields);
      if (Object.keys(apiErr.fields).length) focusFirstError(formRef.current, apiErr.fields);
      else setFormError(apiErr.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchived() {
    if (!product) return;
    setBusy(product.archived ? 'Restoring…' : 'Archiving…');
    try {
      await apiPost(`/products/${product.id}/${product.archived ? 'unarchive' : 'archive'}`);
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const photoPanel = (
    <Dialog
      open={photoStep !== null}
      onOpenChange={(open) => {
        if (!open) setPhotoStep(null);
      }}
      title={photoStep?.step === 'camera' ? 'Take a photo' : 'Adjust photo'}
    >
      {photoStep?.step === 'camera' ? (
        <CameraCapture
          onCaptured={(blob) => {
            setPhotoStep({ step: 'edit', source: blob });
          }}
          onFallback={(file) => {
            setPhotoStep({ step: 'edit', source: file });
          }}
          onCancel={() => {
            setPhotoStep(null);
          }}
        />
      ) : photoStep?.step === 'edit' ? (
        <PhotoEditor
          source={photoStep.source}
          onDone={(blob) => void applyPhoto(blob)}
          onCancel={() => {
            setPhotoStep(null);
          }}
        />
      ) : null}
    </Dialog>
  );

  return (
    <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <div className="flex items-center gap-4">
        {preview ? (
          <img src={preview} alt="" className="size-20 rounded-xl bg-muted object-cover" />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ImagePlus className="size-7" aria-hidden="true" />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPhotoStep({ step: 'camera' });
            }}
          >
            <Camera aria-hidden="true" />
            Take photo
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50">
            <ImageUp className="size-4" aria-hidden="true" />
            {preview ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhotoStep({ step: 'edit', source: file });
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <TextField
        label="Name"
        name="name"
        value={values.name}
        onChange={(e) => {
          set('name', e.target.value);
        }}
        error={errors.name}
        maxLength={80}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Price (₱)"
          name="priceCents"
          inputMode="decimal"
          placeholder="0.00"
          className="tabular"
          value={values.price}
          onChange={(e) => {
            set('price', e.target.value);
          }}
          error={errors.priceCents}
          required
        />
        <TextField
          label="Cost (₱)"
          name="costCents"
          inputMode="decimal"
          placeholder="Optional"
          className="tabular"
          value={values.cost}
          onChange={(e) => {
            set('cost', e.target.value);
          }}
          error={errors.costCents}
          hint="Only admins see this."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="SKU / barcode"
          name="sku"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Optional"
          value={values.sku}
          onChange={(e) => {
            set('sku', e.target.value);
          }}
          error={errors.sku}
          maxLength={40}
        />
        <div className="space-y-2">
          <SelectField
            label="Category"
            name="categoryId"
            value={values.categoryId}
            onChange={(e) => {
              set('categoryId', e.target.value);
            }}
            error={errors.categoryId}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          {newCategory === null ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => {
                setNewCategory('');
              }}
            >
              <Plus aria-hidden="true" />
              New category
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                aria-label="New category name"
                placeholder="e.g. Drinks"
                maxLength={40}
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addCategory();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => void addCategory()}>
                Add
              </Button>
            </div>
          )}
        </div>
      </div>

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Stock</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={values.trackStock}
            onChange={(e) => {
              set('trackStock', e.target.checked);
            }}
          />
          <span>
            Track stock for this product
            <span className="block text-muted-foreground">
              Turn off for things made to order, like drinks or services.
            </span>
          </span>
        </label>
        {values.trackStock ? (
          <div className="grid grid-cols-2 gap-4">
            {editing ? (
              <div className="space-y-1 text-sm">
                <div className="font-medium">In stock</div>
                <div className="text-2xl font-semibold tabular">{product.stock}</div>
                <div className="text-muted-foreground">Change it from Inventory.</div>
              </div>
            ) : (
              <TextField
                label="Opening stock"
                name="stock"
                inputMode="numeric"
                placeholder="0"
                className="tabular"
                value={values.stock}
                onChange={(e) => {
                  set('stock', e.target.value);
                }}
                error={errors.stock}
              />
            )}
            <TextField
              label="Low stock alert at"
              name="lowStockThreshold"
              inputMode="numeric"
              className="tabular"
              value={values.lowStockThreshold}
              onChange={(e) => {
                set('lowStockThreshold', e.target.value);
              }}
              error={errors.lowStockThreshold}
            />
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void toggleArchived()}
          >
            {product.archived ? (
              <ArchiveRestore aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {product.archived ? 'Restore product' : 'Archive product'}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" disabled={busy !== null}>
          {busy ?? (editing ? 'Save changes' : 'Add product')}
        </Button>
      </div>
      {photoPanel}
    </form>
  );
}
