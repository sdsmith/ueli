import { Setting } from "@Core/Settings/Setting";
import { Dropdown, Option } from "@fluentui/react-components";

type Props = {
    backgroundMaterial: string;
    setBackgroundMaterial: (backgroundMaterial: string) => void;
};

export const BackgroundMaterial = ({ backgroundMaterial, setBackgroundMaterial }: Props) => {
    const backgroundMaterialOptions = ["Acrylic", "Mica", "None", "Tabbed"];

    return (
        <Setting
            label="Background material"
            control={
                <Dropdown
                    value={backgroundMaterial}
                    onOptionSelect={(_, { optionValue }) => optionValue && setBackgroundMaterial(optionValue)}
                    selectedOptions={[backgroundMaterial]}
                >
                    {backgroundMaterialOptions.map((b) => (
                        <Option key={`background-material-option-${b}`} value={b}>
                            {b}
                        </Option>
                    ))}
                </Dropdown>
            }
        />
    );
};
