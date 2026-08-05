import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { AppScreen, ScreenHeader } from '@/shared/components';

export interface LegalBlock {
  type: string;
  text?: string;
  items?: string[];
}

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  stand: string;
  sections: LegalSection[];
}

/**
 * Shared renderer for all legal documents. Content lives in the *.de.json
 * files — the SAME files also render the hostable HTML pages for the store
 * listings (`npm run legal:html`), so app and website can never drift apart.
 * All legal routes are unguarded (readable before sign-up, see app/_layout.tsx).
 */
export function LegalDocScreen({ doc }: { doc: LegalDoc }) {
  return (
    <AppScreen scroll>
      <View className="gap-6 pb-10">
        <ScreenHeader
          title={doc.title}
          subtitle={`Stand: ${doc.stand}`}
          onBack={() => router.back()}
        />
        {doc.sections.map((section) => (
          <View key={section.title} className="gap-2.5">
            <Text className="text-[17px] font-bold leading-6 text-foreground">{section.title}</Text>
            {section.blocks.map((block, blockIndex) =>
              block.type === 'list' ? (
                <View key={blockIndex} className="gap-1.5">
                  {(block.items ?? []).map((item) => (
                    <View key={item} className="flex-row items-start gap-2 pl-1">
                      <Text className="text-sm leading-5 text-muted-foreground">{'•'}</Text>
                      <Text className="flex-1 text-sm leading-5 text-muted-foreground">{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text key={blockIndex} className="text-sm leading-5 text-muted-foreground">
                  {block.text}
                </Text>
              ),
            )}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}
