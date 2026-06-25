# Etiquetado de ingresos con reglas de ahorro automático

## Idea

Permite etiquetar cada fuente de ingreso y definir una regla que, cuando ese ingreso
se marca como depositado, transfiere automáticamente un porcentaje a un Fondo de Ahorro
intocable.

**Caso de uso principal:** Todo lo que entre de MemoDreams → ahorrarlo directamente
en un fondo dedicado que no se debe tocar.

## Comportamiento esperado

1. El usuario etiqueta una fuente de ingreso (ej. "memodreams").
2. Configura la regla: `80% → Fondo "No tocar"`.
3. Cuando marca ese ingreso como **depositado ✓**, el sistema calcula
   `real × porcentaje / 100` y crea una aportación automática en ese fondo.
4. La aportación lleva nota automática: `"Auto: MemoDreams junio 2026"`.

## Modelo de datos propuesto

Añadir a `Ingreso` y `IngresoTemplate`:

```typescript
etiqueta?: string          // ej. "memodreams", "freelance", "salario"

regla_ahorro?: {
  fondo_ahorro_id: string  // ID del FondoAhorro destino
  porcentaje: number       // 0–100
}
```

Nueva colección (o embedded en template):

```
users/{uid}/reglas_ingreso/{id}
  etiqueta: string
  fondo_ahorro_id: string
  porcentaje: number
```

## Lo que hay que construir

- [ ] Ampliar modelos `Ingreso` + `IngresoTemplate` con `etiqueta` y `regla_ahorro`
- [ ] UI en Settings: configurar etiqueta y regla por fuente de ingreso
- [ ] Lógica en `IngresosService.update()`: cuando `depositado` pasa a `true`,
      comprobar si hay `regla_ahorro` y crear la aportación en `fondos_ahorro_monthly`
- [ ] Etiqueta visible en la vista de Ingresos junto a cada fuente
- [ ] Notificación o resumen: "Se han ahorrado automáticamente X€ de MemoDreams"

## Notas

- El trigger es `depositado: true` en el ingreso del mes, no en el template.
- Si el porcentaje es 100%, el ingreso completo pasa a ahorro.
- Si el fondo destino no existe, mostrar aviso y no crear la aportación.
