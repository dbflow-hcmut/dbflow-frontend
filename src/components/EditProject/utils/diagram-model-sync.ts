import type { ConceptualModelPayload } from "./conceptual-model.builder";
import type { LogicalModelPayload } from "./logical-model.builder";
import type { PhysicalModelPayload } from "./physical-model.builder";

type ConceptualAttribute = ConceptualModelPayload["entities"][number]["attributes"][number];
type ConceptualRelationship = ConceptualModelPayload["relationships"][number];
type LogicalTable = LogicalModelPayload["tables"][number];
type LogicalColumn = LogicalTable["columns"][number];
type LogicalFD = NonNullable<LogicalTable["functionalDependencies"]>[number];
type PhysicalTable = PhysicalModelPayload["tables"][number];
type PhysicalColumn = PhysicalTable["columns"][number];
type PhysicalFD = NonNullable<PhysicalTable["functionalDependencies"]>[number];
type PhysicalIndex = NonNullable<PhysicalTable["indexes"]>[number];

const stringify = (value: unknown) => JSON.stringify(value);

const findById = <T extends { id: string }>(items: T[] | undefined, id: string) =>
    items?.find((item) => item.id === id);

const mergeConceptualAttributes = (
    current: ConceptualAttribute[] | undefined,
    projection: ConceptualAttribute[] | undefined,
): ConceptualAttribute[] => {
    return (projection ?? []).map((attr) => {
        const existing = findById(current, attr.id);
        const merged = { ...existing, ...attr };
        if (!("components" in attr)) delete merged.components;
        if (!("derivation" in attr)) delete merged.derivation;
        return merged;
    });
};

const mergeConceptualRelationships = (
    current: ConceptualRelationship[] | undefined,
    projection: ConceptualRelationship[] | undefined,
): ConceptualRelationship[] => {
    return (projection ?? []).map((rel) => {
        const existing = findById(current, rel.id);
        const merged: ConceptualRelationship = { ...existing, ...rel };
        if (rel.attributes?.length) {
            merged.attributes = mergeConceptualAttributes(existing?.attributes, rel.attributes);
        } else {
            delete merged.attributes;
        }
        return merged;
    });
};

export const mergeConceptualModelFromDiagramProjection = (
    current: ConceptualModelPayload | null,
    projection: ConceptualModelPayload,
): ConceptualModelPayload => {
    if (!current) return projection;

    const currentGeneralizations = current.generalizations ?? [];
    const currentCategories = current.categories ?? [];
    const projectionGeneralizations = projection.generalizations ?? [];
    const projectionCategories = projection.categories ?? [];

    const next: ConceptualModelPayload = {
        ...current,
        model: current.model,
        entities: projection.entities.map((entity) => {
            const existing = findById(current.entities, entity.id);
            return {
                ...existing,
                ...entity,
                attributes: mergeConceptualAttributes(existing?.attributes, entity.attributes),
            };
        }),
        relationships: mergeConceptualRelationships(current.relationships, projection.relationships),
        generalizations: projectionGeneralizations.map((gen) => ({
            ...findById(currentGeneralizations, gen.id),
            ...gen,
        })),
        categories: projectionCategories.map((cat) => ({
            ...findById(currentCategories, cat.id),
            ...cat,
        })),
    };

    if (!projectionGeneralizations.length) delete next.generalizations;
    if (!projectionCategories.length) delete next.categories;

    return next;
};

const mergeLogicalColumns = (
    current: LogicalColumn[] | undefined,
    projection: LogicalColumn[] | undefined,
): LogicalColumn[] => {
    return (projection ?? []).map((column) => {
        const existing =
            findById(current, column.id) ??
            current?.find((item) => item.name === column.name);
        return {
            ...existing,
            ...column,
            nullable: existing?.nullable ?? column.nullable,
            unique: existing?.unique ?? column.unique,
        };
    });
};

const mergeLogicalFDs = (
    current: LogicalFD[] | undefined,
    projection: LogicalFD[] | undefined,
): LogicalFD[] | undefined => {
    if (projection === undefined) return current;
    if (!projection.length) return [];
    return projection.map((fd) => ({
        ...findById(current, fd.id),
        ...fd,
    }));
};

export const mergeLogicalModelFromDiagramProjection = (
    current: LogicalModelPayload | null,
    projection: LogicalModelPayload,
): LogicalModelPayload => {
    if (!current) return projection;

    return {
        ...current,
        model: current.model,
        tables: projection.tables.map((table) => {
            const existing = findById(current.tables, table.id);
            const merged: LogicalTable = {
                ...existing,
                ...table,
                columns: mergeLogicalColumns(existing?.columns, table.columns),
                functionalDependencies: mergeLogicalFDs(
                    existing?.functionalDependencies,
                    table.functionalDependencies,
                ),
                showFunctionalDependencies:
                    table.showFunctionalDependencies ?? existing?.showFunctionalDependencies,
            };
            if (!merged.functionalDependencies?.length) delete merged.functionalDependencies;
            return merged;
        }),
    };
};

const mergePhysicalColumns = (
    current: PhysicalColumn[] | undefined,
    projection: PhysicalColumn[] | undefined,
): PhysicalColumn[] => {
    return (projection ?? []).map((column) => {
        const existing =
            findById(current, column.id) ??
            current?.find((item) => item.name === column.name);
        return {
            ...existing,
            ...column,
        };
    });
};

const mergePhysicalIndexes = (
    current: PhysicalIndex[] | undefined,
    projection: PhysicalIndex[] | undefined,
): PhysicalIndex[] | undefined => {
    if (!projection?.length) return undefined;
    return projection.map((index) => ({
        ...findById(current, index.id),
        ...index,
    }));
};

const mergePhysicalFDs = (
    current: PhysicalFD[] | undefined,
    projection: PhysicalFD[] | undefined,
): PhysicalFD[] | undefined => {
    if (projection === undefined) return current;
    if (!projection.length) return [];
    return projection.map((fd) => ({
        ...findById(current, fd.id),
        ...fd,
    }));
};

export const mergePhysicalModelFromDiagramProjection = (
    current: PhysicalModelPayload | null,
    projection: PhysicalModelPayload,
): PhysicalModelPayload => {
    if (!current) return projection;

    return {
        ...current,
        model: current.model,
        tables: projection.tables.map((table) => {
            const existing = findById(current.tables, table.id);
            const merged: PhysicalTable = {
                ...existing,
                ...table,
                columns: mergePhysicalColumns(existing?.columns, table.columns),
                indexes: mergePhysicalIndexes(existing?.indexes, table.indexes),
                functionalDependencies: mergePhysicalFDs(
                    existing?.functionalDependencies,
                    table.functionalDependencies,
                ),
                showFunctionalDependencies:
                    table.showFunctionalDependencies ?? existing?.showFunctionalDependencies,
            };
            if (!merged.indexes?.length) delete merged.indexes;
            if (!merged.functionalDependencies?.length) delete merged.functionalDependencies;
            return merged;
        }),
    };
};

export const hasModelChanged = (current: unknown, next: unknown) => stringify(current) !== stringify(next);
