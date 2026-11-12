from dataclasses import dataclass


@dataclass(frozen=True)
class SpeciesInfo:
    id: str
    name_ru: str
    name_kk: str
    latin_name: str
    description: str


SPECIES_CATALOG: list[SpeciesInfo] = [
    SpeciesInfo(
        id="ulmus_pumila",
        name_ru="Карагач (Вяз приземистый)",
        name_kk="Қарағаш",
        latin_name="Ulmus pumila",
        description="Основное засухоустойчивое дерево озеленения Актау, хорошо переносит солёные почвы и ветер.",
    ),
    SpeciesInfo(
        id="elaeagnus_angustifolia",
        name_ru="Лох узколистный (Джида)",
        name_kk="Жиде",
        latin_name="Elaeagnus angustifolia",
        description="Серебристая листва, устойчив к засухе и засолению почв Мангистау.",
    ),
    SpeciesInfo(
        id="tamarix_ramosissima",
        name_ru="Тамариск (Гребенщик)",
        name_kk="Жыңғыл",
        latin_name="Tamarix ramosissima",
        description="Кустарник или небольшое дерево с мелкими чешуйчатыми листьями и розовыми соцветиями.",
    ),
    SpeciesInfo(
        id="populus_alba",
        name_ru="Тополь серебристый",
        name_kk="Ақ терек",
        latin_name="Populus alba",
        description="Крупное дерево с беловатой корой и двухцветными листьями, часто встречается во дворах.",
    ),
    SpeciesInfo(
        id="fraxinus_pennsylvanica",
        name_ru="Ясень пенсильванский",
        name_kk="Шаған",
        latin_name="Fraxinus pennsylvanica",
        description="Лиственное дерево со сложными непарноперистыми листьями, используется в аллейных посадках.",
    ),
    SpeciesInfo(
        id="robinia_pseudoacacia",
        name_ru="Акация белая (Робиния)",
        name_kk="Ақ қараған",
        latin_name="Robinia pseudoacacia",
        description="Декоративное дерево с перистыми листьями и белыми ароматными цветками.",
    ),
    SpeciesInfo(
        id="morus_alba",
        name_ru="Тутовник (Шелковица)",
        name_kk="Тұт ағашы",
        latin_name="Morus alba",
        description="Плодовое и декоративное дерево с густой раскидистой кроной, даёт хорошую тень.",
    ),
]

SPECIES_BY_ID = {s.id: s for s in SPECIES_CATALOG}
SPECIES_NAMES = [s.name_ru for s in SPECIES_CATALOG]
